import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { newDb, DataType } from 'pg-mem';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool as PgPool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/platform/database/database.service.js';
import * as schema from '../src/platform/database/all-schema.js';

type Registration = {
  organization: { id: string; name: string; slug: string };
  tokens: { accessToken: string; refreshToken: string };
};

type PgMemQuery = string | {
  text: string;
  values?: unknown[];
  types?: unknown;
  rowMode?: string;
  [key: string]: unknown;
};

type PgMemResult = {
  rows: Record<string, unknown>[];
  [key: string]: unknown;
};

async function executePgMem(
  executor: (query: unknown, values?: readonly unknown[]) => Promise<unknown>,
  query: PgMemQuery,
  values?: readonly unknown[],
) {
  if (typeof query === 'string') return executor(query, values);

  const wantsArrayRows = query.rowMode === 'array';
  const { types: _types, rowMode: _rowMode, ...supported } = query;
  const result = (await executor(supported, values)) as PgMemResult;

  if (!wantsArrayRows) return result;
  return {
    ...result,
    rows: result.rows.map((row) => Object.values(row)),
  };
}

describe('Phase 1 SaaS foundation', () => {
  let app: INestApplication;
  let pool: { query(text: string): Promise<unknown>; end(): Promise<void> };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-phase-one';
    process.env.META_TRANSPORT_MODE = 'mock';
    process.env.META_GRAPH_VERSION = 'v99.0';
    process.env.META_APP_ID = 'test-meta-app';
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = 'test-config';
    process.env.META_APP_SECRET = 'test-meta-app-secret';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-webhook-token';
    process.env.AI_TRANSPORT_MODE = 'mock';
    process.env.AI_OPENAI_FAST_MODEL = 'gpt-6-luna';
    process.env.AI_OPENAI_REASONING_MODEL = 'gpt-6.1-sol';
    process.env.AI_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    memory.public.registerEquivalentSizableType({
      name: 'vector',
      equivalentTo: DataType.text,
      isValid: () => true,
    });
    memory.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
    const adapter = memory.adapters.createPg();
    const rawPool = new adapter.Pool();
    pool = rawPool;

    const migrationDirectory = resolve(process.cwd(), 'drizzle');
    const migrationNames = readdirSync(migrationDirectory)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    if (!migrationNames.length) throw new Error('No generated SQL migration found.');
    for (const migrationName of migrationNames) {
      const migration = readFileSync(resolve(migrationDirectory, migrationName), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        const sql = statement.trim();
        if (!sql || sql.toUpperCase().startsWith('CREATE EXTENSION')) continue;
        await pool.query(sql);
      }
    }

    const drizzlePool = {
      query: (query: PgMemQuery, values?: readonly unknown[]) =>
        executePgMem(
          (supported, supportedValues) =>
            rawPool.query(supported as never, supportedValues as never),
          query,
          values,
        ),
      connect: async () => {
        const client = await rawPool.connect();
        return {
          query: (query: PgMemQuery, values?: readonly unknown[]) =>
            executePgMem(
              (supported, supportedValues) =>
                client.query(supported as never, supportedValues as never),
              query,
              values,
            ),
          release: () => client.release(),
        };
      },
      end: () => rawPool.end(),
    };

    const db = drizzle(drizzlePool as unknown as PgPool, { schema });
    const database = {
      pool: drizzlePool as unknown as PgPool,
      db,
      health: async () => true,
      onModuleDestroy: async () => rawPool.end(),
    };

    const testConfig: Record<string, unknown> = {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-long-enough-for-phase-one',
      JWT_ACCESS_TTL_SECONDS: 900,
      META_TRANSPORT_MODE: 'mock',
      META_GRAPH_VERSION: 'v99.0',
      META_APP_ID: 'test-meta-app',
      META_EMBEDDED_SIGNUP_CONFIG_ID: 'test-config',
      META_APP_SECRET: 'test-meta-app-secret',
      META_WEBHOOK_VERIFY_TOKEN: 'test-webhook-token',
      AI_TRANSPORT_MODE: 'mock',
      AI_OPENAI_FAST_MODEL: 'gpt-6-luna',
      AI_OPENAI_REASONING_MODEL: 'gpt-6.1-sol',
      AI_OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    };
    const configService = {
      get: (key: string) => testConfig[key],
      getOrThrow: (key: string) => {
        const value = testConfig[key];
        if (value === undefined) throw new Error('Missing test config: ' + key);
        return value;
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(input: {
    email: string;
    organizationName: string;
    organizationSlug: string;
  }): Promise<Registration> {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        ...input,
        displayName: 'Owner',
        password: 'StrongPassword123!',
      })
      .expect(201);
    return response.body as Registration;
  }

  it('keeps tenant data session-bound and rotates sessions safely', async () => {
    const tenantA = await register({
      email: 'owner-a@example.com',
      organizationName: 'Tenant A',
      organizationSlug: 'tenant-a',
    });
    const tenantB = await register({
      email: 'owner-b@example.com',
      organizationName: 'Tenant B',
      organizationSlug: 'tenant-b',
    });

    const currentA = await request(app.getHttpServer())
      .get(`/v1/organization/current?organizationId=${tenantB.organization.id}`)
      .set('authorization', `Bearer ${tenantA.tokens.accessToken}`)
      .expect(200);
    expect(currentA.body.organization.id).toBe(tenantA.organization.id);
    expect(currentA.body.organization.id).not.toBe(tenantB.organization.id);

    const currentB = await request(app.getHttpServer())
      .get('/v1/organization/current')
      .set('authorization', `Bearer ${tenantB.tokens.accessToken}`)
      .expect(200);
    expect(currentB.body.organization.id).toBe(tenantB.organization.id);

    const capabilities = await request(app.getHttpServer())
      .get('/v1/capabilities')
      .set('authorization', `Bearer ${tenantA.tokens.accessToken}`)
      .expect(200);
    expect(capabilities.body.organizationId).toBe(tenantA.organization.id);
    expect(capabilities.body.entitlements).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'core.crm', enabled: true })]),
    );

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'owner-a@example.com',
        password: 'StrongPassword123!',
        organizationSlug: 'tenant-b',
      })
      .expect(401);

    const refresh = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: tenantA.tokens.refreshToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: tenantA.tokens.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .get('/v1/organization/current')
      .set('authorization', `Bearer ${refresh.body.accessToken as string}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${refresh.body.accessToken as string}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/v1/organization/current')
      .set('authorization', `Bearer ${refresh.body.accessToken as string}`)
      .expect(401);
  });

  it('runs CRM workflows without crossing tenant boundaries', async () => {
    const tenantC = await register({
      email: 'crm-c@example.com',
      organizationName: 'CRM Tenant C',
      organizationSlug: 'crm-tenant-c',
    });
    const tenantD = await register({
      email: 'crm-d@example.com',
      organizationName: 'CRM Tenant D',
      organizationSlug: 'crm-tenant-d',
    });
    const authC = { authorization: `Bearer ${tenantC.tokens.accessToken}` };
    const authD = { authorization: `Bearer ${tenantD.tokens.accessToken}` };

    const contact = await request(app.getHttpServer())
      .post('/v1/crm/contacts')
      .set(authC)
      .send({
        displayName: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '9876543210',
        source: 'META',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/crm/contacts/${contact.body.id as string}`)
      .set(authD)
      .expect(404);

    const company = await request(app.getHttpServer())
      .post('/v1/crm/companies')
      .set(authC)
      .send({
        name: 'Acme Developers',
        industry: 'Real Estate',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/crm/contacts/${contact.body.id as string}/companies`)
      .set(authC)
      .send({
        companyId: company.body.id,
        relationship: 'Buyer at company',
        isPrimary: true,
      })
      .expect(201);

    const contactCompanies = await request(app.getHttpServer())
      .get(`/v1/crm/contacts/${contact.body.id as string}/companies`)
      .set(authC)
      .expect(200);
    expect(contactCompanies.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          companyId: company.body.id,
          isPrimary: true,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post('/v1/crm/leads')
      .set(authD)
      .send({
        title: 'Illegal cross-tenant lead',
        contactId: contact.body.id,
      })
      .expect(404);

    const lead = await request(app.getHttpServer())
      .post('/v1/crm/leads')
      .set(authC)
      .send({
        title: '3 BHK enquiry',
        contactId: contact.body.id,
        source: 'META',
        estimatedValue: '12500000',
        temperature: 'HOT',
      })
      .expect(201);

    const leadPipeline = await request(app.getHttpServer())
      .get('/v1/crm/pipelines?objectType=LEAD')
      .set(authC)
      .expect(200);
    const qualifiedStage = leadPipeline.body.stages.find(
      (stage: { key: string }) => stage.key === 'qualified',
    );
    expect(qualifiedStage).toBeTruthy();

    const qualifiedLead = await request(app.getHttpServer())
      .patch(`/v1/crm/leads/${lead.body.id as string}`)
      .set(authC)
      .send({ stageId: qualifiedStage.id })
      .expect(200);
    expect(qualifiedLead.body.status).toBe('QUALIFIED');

    const deal = await request(app.getHttpServer())
      .post('/v1/crm/deals')
      .set(authC)
      .send({
        name: 'Rahul property deal',
        leadId: lead.body.id,
        contactId: contact.body.id,
        amount: '12500000',
      })
      .expect(201);

    const dealPipeline = await request(app.getHttpServer())
      .get('/v1/crm/pipelines?objectType=DEAL')
      .set(authC)
      .expect(200);
    const wonStage = dealPipeline.body.stages.find(
      (stage: { key: string }) => stage.key === 'won',
    );

    const wonDeal = await request(app.getHttpServer())
      .patch(`/v1/crm/deals/${deal.body.id as string}`)
      .set(authC)
      .send({ stageId: wonStage.id })
      .expect(200);
    expect(wonDeal.body.status).toBe('WON');
    expect(wonDeal.body.probability).toBe(100);

    await request(app.getHttpServer())
      .post('/v1/crm/tasks')
      .set(authC)
      .send({
        title: 'Prepare booking documents',
        dealId: deal.body.id,
        priority: 'HIGH',
      })
      .expect(201);
  });

  it('runs Meta partner onboarding and WhatsApp inbox safely', async () => {
    const tenant = await register({
      email: 'whatsapp-owner@example.com',
      organizationName: 'WhatsApp Tenant',
      organizationSlug: 'whatsapp-tenant',
    });
    const auth = {
      authorization: `Bearer ${tenant.tokens.accessToken}`,
    };

    const begin = await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/begin')
      .set(auth)
      .send({})
      .expect(201);
    expect(begin.body.appId).toBe('test-meta-app');
    expect(begin.body.configId).toBe('test-config');

    const completed = await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/complete')
      .set(auth)
      .send({
        connectionId: begin.body.connectionId,
        signupState: begin.body.state,
        authorizationCode: 'mock-embedded-signup-code',
        businessPortfolioId: 'business-test-1',
        wabaId: 'waba-test-1',
        phoneNumberId: 'phone-number-test-1',
        displayName: 'WhatsApp Sales',
        displayAddress: '+91 90000 00001',
      })
      .expect(201);

    expect(completed.body.connection.connectionStatus).toBe('CONNECTED');
    expect(completed.body.connection.clientAssetOwnership).toBe('CLIENT');
    expect(completed.body.channel.status).toBe('CONNECTED');

    await request(app.getHttpServer())
      .get(
        '/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=test-webhook-token&hub.challenge=12345',
      )
      .expect(200)
      .expect('12345');

    const inboundPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-test-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '919000000001',
                  phone_number_id: 'phone-number-test-1',
                },
                contacts: [
                  {
                    profile: { name: 'Priya Client' },
                    wa_id: '919811111111',
                  },
                ],
                messages: [
                  {
                    from: '919811111111',
                    id: 'wamid.inbound.1',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'I need a 3 BHK interior quotation' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const inboundRaw = JSON.stringify(inboundPayload);
    const inboundSignature =
      'sha256=' +
      createHmac('sha256', 'test-meta-app-secret')
        .update(inboundRaw)
        .digest('hex');

    await request(app.getHttpServer())
      .post('/v1/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', inboundSignature)
      .send(inboundRaw)
      .expect(201);

    // At-least-once Meta delivery must not duplicate the message.
    await request(app.getHttpServer())
      .post('/v1/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', inboundSignature)
      .send(inboundRaw)
      .expect(201);

    const conversations = await request(app.getHttpServer())
      .get('/v1/communication/conversations')
      .set(auth)
      .expect(200);
    expect(conversations.body).toHaveLength(1);
    expect(conversations.body[0]).toMatchObject({
      contactName: 'Priya Client',
      contactPhone: '919811111111',
      handlingMode: 'HUMAN',
      unreadCount: 1,
    });

    const conversationId = conversations.body[0].id as string;
    const inboundMessages = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversationId}/messages`,
      )
      .set(auth)
      .expect(200);
    expect(inboundMessages.body).toHaveLength(1);
    expect(inboundMessages.body[0]).toMatchObject({
      direction: 'INBOUND',
      externalMessageId: 'wamid.inbound.1',
      textBody: 'I need a 3 BHK interior quotation',
    });

    await request(app.getHttpServer())
      .patch(`/v1/communication/conversations/${conversationId}`)
      .set(auth)
      .send({ handlingMode: 'AI_ASSIST' })
      .expect(200);

    const outbound = await request(app.getHttpServer())
      .post(
        `/v1/communication/conversations/${conversationId}/messages/text`,
      )
      .set(auth)
      .send({ text: 'Sure. I can help you with that.' })
      .expect(201);
    expect(outbound.body.direction).toBe('OUTBOUND');
    expect(outbound.body.externalMessageId).toContain('mock.wamid.');

    const template = await request(app.getHttpServer())
      .post('/v1/communication/templates')
      .set(auth)
      .send({
        channelAccountId: completed.body.channel.id,
        name: 'follow_up_offer',
        language: 'en',
        category: 'MARKETING',
        components: [
          {
            type: 'BODY',
            text: 'Would you like to continue your enquiry?',
          },
        ],
      })
      .expect(201);

    const submittedTemplate = await request(app.getHttpServer())
      .post(
        `/v1/communication/templates/${template.body.id}/submit`,
      )
      .set(auth)
      .expect(201);
    expect(submittedTemplate.body.status).toBe('PENDING');
    expect(submittedTemplate.body.providerTemplateId).toContain(
      'mock-template-',
    );

    await request(app.getHttpServer())
      .post(
        `/v1/communication/conversations/${conversationId}/messages/template`,
      )
      .set(auth)
      .send({ templateId: template.body.id })
      .expect(409);

    await request(app.getHttpServer())
      .post(
        `/v1/communication/contacts/${conversations.body[0].contactId}/consent`,
      )
      .set(auth)
      .send({
        purpose: 'MARKETING',
        status: 'GRANTED',
        source: 'WHATSAPP_INBOUND',
        proof: { sourceMessageId: 'wamid.inbound.1' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/communication/conversations/${conversationId}/messages/template`,
      )
      .set(auth)
      .send({ templateId: template.body.id })
      .expect(201);

    const templateApprovalPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-test-1',
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                message_template_name: 'follow_up_offer',
                message_template_language: 'en',
                event: 'APPROVED',
              },
            },
          ],
        },
      ],
    };
    const templateApprovalRaw = JSON.stringify(templateApprovalPayload);
    const templateApprovalSignature =
      'sha256=' +
      createHmac('sha256', 'test-meta-app-secret')
        .update(templateApprovalRaw)
        .digest('hex');

    await request(app.getHttpServer())
      .post('/v1/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', templateApprovalSignature)
      .send(templateApprovalRaw)
      .expect(201);

    const approvedTemplates = await request(app.getHttpServer())
      .get('/v1/communication/templates')
      .set(auth)
      .expect(200);
    expect(
      approvedTemplates.body.find(
        (item: { id: string }) => item.id === template.body.id,
      )?.status,
    ).toBe('APPROVED');

    const campaign = await request(app.getHttpServer())
      .post('/v1/communication/campaigns')
      .set(auth)
      .send({
        name: 'October follow-up',
        channelAccountId: completed.body.channel.id,
        templateId: template.body.id,
        audienceFilters: {
          contactIds: [conversations.body[0].contactId],
        },
      })
      .expect(201);

    const queuedCampaign = await request(app.getHttpServer())
      .post(
        `/v1/communication/campaigns/${campaign.body.id}/queue`,
      )
      .set(auth)
      .expect(201);
    expect(queuedCampaign.body.recipientCount).toBe(1);
    expect(queuedCampaign.body.campaign.status).toBe('QUEUED');

    const stopPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-test-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: 'phone-number-test-1',
                },
                messages: [
                  {
                    from: '919811111111',
                    id: 'wamid.stop.1',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'STOP' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const stopRaw = JSON.stringify(stopPayload);
    const stopSignature =
      'sha256=' +
      createHmac('sha256', 'test-meta-app-secret')
        .update(stopRaw)
        .digest('hex');

    await request(app.getHttpServer())
      .post('/v1/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', stopSignature)
      .send(stopRaw)
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/communication/conversations/${conversationId}/messages/template`,
      )
      .set(auth)
      .send({ templateId: template.body.id })
      .expect(409);

    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-test-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: 'phone-number-test-1',
                },
                statuses: [
                  {
                    id: outbound.body.externalMessageId,
                    status: 'read',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: '919811111111',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const statusRaw = JSON.stringify(statusPayload);
    const statusSignature =
      'sha256=' +
      createHmac('sha256', 'test-meta-app-secret')
        .update(statusRaw)
        .digest('hex');

    await request(app.getHttpServer())
      .post('/v1/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', statusSignature)
      .send(statusRaw)
      .expect(201);

    const finalMessages = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversationId}/messages`,
      )
      .set(auth)
      .expect(200);
    expect(
      finalMessages.body.find(
        (item: { id: string }) => item.id === outbound.body.id,
      )?.status,
    ).toBe('READ');
  });

  it('governs tenant AI agents, knowledge and tool approvals safely', async () => {
    const tenantE = await register({
      email: 'ai-e@example.com',
      organizationName: 'AI Tenant E',
      organizationSlug: 'ai-tenant-e',
    });
    const tenantF = await register({
      email: 'ai-f@example.com',
      organizationName: 'AI Tenant F',
      organizationSlug: 'ai-tenant-f',
    });
    const authE = {
      authorization: `Bearer ${tenantE.tokens.accessToken}`,
    };
    const authF = {
      authorization: `Bearer ${tenantF.tokens.accessToken}`,
    };

    const contact = await request(app.getHttpServer())
      .post('/v1/crm/contacts')
      .set(authE)
      .send({
        displayName: 'AI Test Client',
        phone: '919822222222',
        source: 'WHATSAPP',
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/v1/ai/agents')
      .set(authE)
      .send({
        key: 'whatsapp-client-handler',
        name: 'WhatsApp Client Handler',
        role: 'SALES_ASSISTANT',
        defaultHandlingMode: 'AI_ASSIST',
        instructions:
          'Help the business handle client enquiries. Use only approved tools and tenant knowledge. Escalate whenever authority is insufficient.',
      })
      .expect(201);

    const agentId = created.body.agent.id as string;
    const versionId = created.body.version.id as string;

    for (const policy of [
      { toolKey: 'get_contact', mode: 'AUTO' },
      { toolKey: 'search_knowledge', mode: 'AUTO' },
      { toolKey: 'create_task', mode: 'APPROVAL' },
    ]) {
      await request(app.getHttpServer())
        .put(`/v1/ai/agents/${agentId}/versions/${versionId}/tools`)
        .set(authE)
        .send(policy)
        .expect(200);
    }

    await request(app.getHttpServer())
      .post(
        `/v1/ai/agents/${agentId}/versions/${versionId}/activate`,
      )
      .set(authE)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/ai/agents/${agentId}/run`)
      .set(authF)
      .send({ input: 'Try to access another tenant agent.' })
      .expect(404);

    const knowledgeBase = await request(app.getHttpServer())
      .post('/v1/ai/knowledge-bases')
      .set(authE)
      .send({
        key: 'business-faq',
        name: 'Business FAQ',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/ai/knowledge-bases/${knowledgeBase.body.id as string}/documents/text`,
      )
      .set(authE)
      .send({
        title: 'Service policy',
        content:
          'Our premium service includes a ten year warranty and priority support. Standard installation is scheduled after site confirmation.',
      })
      .expect(201);

    const search = await request(app.getHttpServer())
      .post(
        `/v1/ai/knowledge-bases/${knowledgeBase.body.id as string}/search`,
      )
      .set(authE)
      .send({ query: 'What warranty is included?', limit: 3 })
      .expect(201);
    expect(search.body.length).toBeGreaterThan(0);
    expect(search.body[0].content).toContain('ten year warranty');

    const run = await request(app.getHttpServer())
      .post(`/v1/ai/agents/${agentId}/run`)
      .set(authE)
      .send({
        contactId: contact.body.id,
        input: 'Summarize this client enquiry.',
        routing: 'FAST',
      })
      .expect(201);
    expect(run.body.status).toBe('COMPLETED');
    expect(run.body.model).toBe('gpt-6-luna');
    expect(run.body.totalTokens).toBeGreaterThan(0);

    const readTool = await request(app.getHttpServer())
      .post(
        `/v1/ai/runs/${run.body.id as string}/tools/get_contact/simulate`,
      )
      .set(authE)
      .send({ arguments: { contactId: contact.body.id } })
      .expect(201);
    expect(readTool.body.status).toBe('COMPLETED');
    expect(readTool.body.result.id).toBe(contact.body.id);

    const approvalRequest = await request(app.getHttpServer())
      .post(
        `/v1/ai/runs/${run.body.id as string}/tools/create_task/simulate`,
      )
      .set(authE)
      .send({
        arguments: {
          title: 'Human approved AI follow-up',
          contactId: contact.body.id,
          priority: 'HIGH',
        },
      })
      .expect(201);
    expect(approvalRequest.body.status).toBe('APPROVAL_REQUIRED');

    const approvals = await request(app.getHttpServer())
      .get('/v1/ai/approvals')
      .set(authE)
      .expect(200);
    const approval = approvals.body.find(
      (item: { approval: { id: string } }) =>
        item.approval.id === approvalRequest.body.approvalId,
    );
    expect(approval).toBeTruthy();

    const approved = await request(app.getHttpServer())
      .post(
        `/v1/ai/approvals/${approvalRequest.body.approvalId as string}/decision`,
      )
      .set(authE)
      .send({
        status: 'APPROVED',
        reason: 'Approved for this client follow-up.',
      })
      .expect(201);
    expect(approved.body.status).toBe('COMPLETED');

    const tasks = await request(app.getHttpServer())
      .get('/v1/crm/tasks?limit=100')
      .set(authE)
      .expect(200);
    expect(
      tasks.body.some(
        (item: { title: string }) =>
          item.title === 'Human approved AI follow-up',
      ),
    ).toBe(true);

    const usage = await request(app.getHttpServer())
      .get('/v1/ai/usage')
      .set(authE)
      .expect(200);
    expect(
      usage.body.some(
        (item: { operation: string }) => item.operation === 'AGENT_RUN',
      ),
    ).toBe(true);
    expect(
      usage.body.some(
        (item: { operation: string }) => item.operation === 'EMBEDDING',
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/v1/ai/runs/${run.body.id as string}/evaluations`)
      .set(authE)
      .send({
        evaluator: 'PHASE4_E2E',
        score: 1,
        passed: true,
        label: 'governed-run',
      })
      .expect(201);

    const version2 = await request(app.getHttpServer())
      .post(`/v1/ai/agents/${agentId}/versions`)
      .set(authE)
      .send({
        instructions:
          'Handle client enquiries using only tenant-approved knowledge and governed tools. Prefer human handoff when confidence is low.',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/ai/agents/${agentId}/versions/${version2.body.id as string}/activate`,
      )
      .set(authE)
      .expect(201);

    const versions = await request(app.getHttpServer())
      .get(`/v1/ai/agents/${agentId}/versions`)
      .set(authE)
      .expect(200);
    expect(
      versions.body.find(
        (item: { id: string }) => item.id === versionId,
      )?.status,
    ).toBe('ARCHIVED');
    expect(
      versions.body.find(
        (item: { id: string }) => item.id === version2.body.id,
      )?.status,
    ).toBe('ACTIVE');
  });
});
