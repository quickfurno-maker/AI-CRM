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

  it('runs the AI WhatsApp client handler in assist and autonomous modes safely', async () => {
    const tenantG = await register({
      email: 'ai-whatsapp-g@example.com',
      organizationName: 'AI WhatsApp Tenant G',
      organizationSlug: 'ai-whatsapp-tenant-g',
    });
    const tenantH = await register({
      email: 'ai-whatsapp-h@example.com',
      organizationName: 'AI WhatsApp Tenant H',
      organizationSlug: 'ai-whatsapp-tenant-h',
    });
    const authG = {
      authorization: `Bearer ${tenantG.tokens.accessToken}`,
    };
    const authH = {
      authorization: `Bearer ${tenantH.tokens.accessToken}`,
    };

    await pool.query(
      `insert into entitlements
        (organization_id, key, enabled, source)
       values
        ('${tenantG.organization.id}', 'ai.whatsapp_client_handler', true, 'ADDON')`,
    );

    const agent = await request(app.getHttpServer())
      .post('/v1/ai/agents')
      .set(authG)
      .send({
        key: 'whatsapp-handler',
        name: 'WhatsApp Client Handler',
        role: 'CLIENT_HANDLER',
        defaultHandlingMode: 'AI_ASSIST',
        instructions:
          'Handle WhatsApp client enquiries using only approved tenant knowledge and tools. Never invent business facts. Escalate when authority is insufficient.',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/ai/agents/${agent.body.agent.id as string}/versions/${agent.body.version.id as string}/activate`,
      )
      .set(authG)
      .expect(201);

    const begin = await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/begin')
      .set(authG)
      .send({})
      .expect(201);

    const connected = await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/complete')
      .set(authG)
      .send({
        connectionId: begin.body.connectionId,
        signupState: begin.body.state,
        authorizationCode: 'mock-ai-whatsapp-code',
        businessPortfolioId: 'business-ai-whatsapp-1',
        wabaId: 'waba-ai-whatsapp-1',
        phoneNumberId: 'phone-ai-whatsapp-1',
        displayName: 'AI WhatsApp',
        displayAddress: '+91 90000 00009',
      })
      .expect(201);

    await request(app.getHttpServer())
      .put('/v1/ai/whatsapp/bindings')
      .set(authG)
      .send({
        channelAccountId: connected.body.channel.id,
        agentId: agent.body.agent.id,
        enabled: true,
        defaultHandlingMode: 'AI_ASSIST',
        maxContextMessages: 20,
        autoReplyEnabled: false,
      })
      .expect(200);

    const signAndSendInbound = async (
      externalMessageId: string,
      textBody: string,
    ) => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-ai-whatsapp-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '919000000009',
                    phone_number_id: 'phone-ai-whatsapp-1',
                  },
                  contacts: [
                    {
                      profile: { name: 'AI WhatsApp Client' },
                      wa_id: '919833333333',
                    },
                  ],
                  messages: [
                    {
                      from: '919833333333',
                      id: externalMessageId,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body: textBody },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(payload);
      const signature =
        'sha256=' +
        createHmac('sha256', 'test-meta-app-secret')
          .update(raw)
          .digest('hex');

      await request(app.getHttpServer())
        .post('/v1/webhooks/meta/whatsapp')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(raw)
        .expect(201);
    };

    await signAndSendInbound(
      'wamid.ai.assist.1',
      'Can you help me understand your premium service?',
    );

    const conversations = await request(app.getHttpServer())
      .get('/v1/communication/conversations')
      .set(authG)
      .expect(200);
    expect(conversations.body).toHaveLength(1);
    const conversationId = conversations.body[0].id as string;

    let conversationMessages = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversationId}/messages`,
      )
      .set(authG)
      .expect(200);
    const assistInbound = conversationMessages.body.find(
      (item: { externalMessageId?: string }) =>
        item.externalMessageId === 'wamid.ai.assist.1',
    );
    expect(assistInbound).toBeTruthy();

    const assistResult = await request(app.getHttpServer())
      .post('/v1/ai/whatsapp/process')
      .set(authG)
      .send({ messageId: assistInbound.id })
      .expect(201);
    expect(assistResult.body.status).toBe('COMPLETED');
    expect(assistResult.body.mode).toBe('AI_ASSIST');
    expect(assistResult.body.suggestionId).toBeTruthy();

    const crossTenantReplay = await request(app.getHttpServer())
      .post('/v1/ai/whatsapp/process')
      .set(authH)
      .send({ messageId: assistInbound.id })
      .expect(201);
    expect(crossTenantReplay.body).toMatchObject({
      status: 'SKIPPED',
      reason: 'Inbound message not found.',
    });

    const suggestions = await request(app.getHttpServer())
      .get('/v1/ai/whatsapp/suggestions')
      .set(authG)
      .expect(200);
    const draft = suggestions.body.find(
      (item: { id: string }) =>
        item.id === assistResult.body.suggestionId,
    );
    expect(draft?.status).toBe('DRAFT');

    await request(app.getHttpServer())
      .post(
        `/v1/ai/whatsapp/suggestions/${assistResult.body.suggestionId as string}/send`,
      )
      .set(authG)
      .expect(201);

    await request(app.getHttpServer())
      .put('/v1/ai/whatsapp/bindings')
      .set(authG)
      .send({
        channelAccountId: connected.body.channel.id,
        agentId: agent.body.agent.id,
        enabled: true,
        defaultHandlingMode: 'AI',
        maxContextMessages: 20,
        autoReplyEnabled: true,
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `/v1/communication/conversations/${conversationId}`,
      )
      .set(authG)
      .send({ handlingMode: 'AI' })
      .expect(200);

    await signAndSendInbound(
      'wamid.ai.auto.2',
      'Please continue and tell me the next step.',
    );

    conversationMessages = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversationId}/messages`,
      )
      .set(authG)
      .expect(200);
    const autonomousInbound = conversationMessages.body.find(
      (item: { externalMessageId?: string }) =>
        item.externalMessageId === 'wamid.ai.auto.2',
    );
    expect(autonomousInbound).toBeTruthy();

    const autonomous = await request(app.getHttpServer())
      .post('/v1/ai/whatsapp/process')
      .set(authG)
      .send({ messageId: autonomousInbound.id })
      .expect(201);
    expect(autonomous.body.status).toBe('COMPLETED');
    expect(autonomous.body.mode).toBe('AI');
    expect(autonomous.body.outboundMessageId).toBeTruthy();

    const bindingsOtherTenant = await request(app.getHttpServer())
      .get('/v1/ai/whatsapp/bindings')
      .set(authH)
      .expect(200);
    expect(bindingsOtherTenant.body).toHaveLength(0);

    const jobs = await request(app.getHttpServer())
      .get('/v1/ai/whatsapp/jobs')
      .set(authG)
      .expect(200);
    expect(
      jobs.body.filter(
        (item: { status: string }) => item.status === 'COMPLETED',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('executes versioned automations with branching waits approvals and idempotent events', async () => {
    const tenantI = await register({
      email: 'automation-i@example.com',
      organizationName: 'Automation Tenant I',
      organizationSlug: 'automation-tenant-i',
    });
    const tenantJ = await register({
      email: 'automation-j@example.com',
      organizationName: 'Automation Tenant J',
      organizationSlug: 'automation-tenant-j',
    });
    const authI = {
      authorization: `Bearer ${tenantI.tokens.accessToken}`,
    };
    const authJ = {
      authorization: `Bearer ${tenantJ.tokens.accessToken}`,
    };

    const manualWorkflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authI)
      .send({
        key: 'qualified-follow-up',
        name: 'Qualified Follow Up',
        triggerType: 'MANUAL',
        triggerConfig: {},
      })
      .expect(201);

    const manualWorkflowId = manualWorkflow.body.workflow.id as string;
    const manualVersionId = manualWorkflow.body.version.id as string;

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${manualWorkflowId}/versions/${manualVersionId}/graph`,
      )
      .set(authI)
      .send({
        startNodeKey: 'score_gate',
        nodes: [
          {
            nodeKey: 'score_gate',
            nodeType: 'CONDITION',
            name: 'Qualified score?',
            config: {
              path: 'input.score',
              operator: 'GTE',
              value: 50,
            },
          },
          {
            nodeKey: 'wait_short',
            nodeType: 'WAIT',
            name: 'Short wait',
            config: { durationSeconds: 1 },
          },
          {
            nodeKey: 'create_task',
            nodeType: 'ACTION',
            name: 'Create follow up',
            config: {
              action: 'CRM_CREATE_TASK',
              input: {
                title: 'Follow up {{input.name}}',
                description: 'Created by automation run {{automation.runId}}',
                priority: 'HIGH',
              },
            },
          },
          {
            nodeKey: 'human_gate',
            nodeType: 'APPROVAL',
            name: 'Human approval',
            config: {
              title: 'Approve qualified lead follow-up',
              description: 'Confirm the nurture path can continue.',
              expirySeconds: 3600,
            },
          },
          {
            nodeKey: 'approved_end',
            nodeType: 'END',
            name: 'Approved',
            config: {},
          },
          {
            nodeKey: 'rejected_end',
            nodeType: 'END',
            name: 'Rejected or not qualified',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'score_true',
            sourceNodeKey: 'score_gate',
            targetNodeKey: 'wait_short',
            branchKey: 'TRUE',
          },
          {
            edgeKey: 'score_false',
            sourceNodeKey: 'score_gate',
            targetNodeKey: 'rejected_end',
            branchKey: 'FALSE',
          },
          {
            edgeKey: 'wait_to_task',
            sourceNodeKey: 'wait_short',
            targetNodeKey: 'create_task',
          },
          {
            edgeKey: 'task_to_approval',
            sourceNodeKey: 'create_task',
            targetNodeKey: 'human_gate',
          },
          {
            edgeKey: 'approval_yes',
            sourceNodeKey: 'human_gate',
            targetNodeKey: 'approved_end',
            branchKey: 'APPROVED',
          },
          {
            edgeKey: 'approval_no',
            sourceNodeKey: 'human_gate',
            targetNodeKey: 'rejected_end',
            branchKey: 'REJECTED',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${manualWorkflowId}/versions/${manualVersionId}/activate`,
      )
      .set(authI)
      .expect(201);

    const started = await request(app.getHttpServer())
      .post(`/v1/automation/workflows/${manualWorkflowId}/trigger`)
      .set(authI)
      .send({
        context: {
          score: 82,
          name: 'Automation Client',
        },
        correlationId: 'automation-manual-1',
      })
      .expect(201);

    expect(started.body.run.status).toBe('WAITING');
    const waitingRunId = started.body.run.id as string;

    await request(app.getHttpServer())
      .post(`/v1/automation/runs/${waitingRunId}/resume`)
      .set(authI)
      .expect(409);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const waitingApproval = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${waitingRunId}/resume`)
      .set(authI)
      .expect(201);
    expect(waitingApproval.body.run.status).toBe('WAITING_APPROVAL');

    const tasksAfterAction = await request(app.getHttpServer())
      .get('/v1/crm/tasks')
      .set(authI)
      .expect(200);
    expect(
      tasksAfterAction.body.some(
        (item: { title: string }) =>
          item.title === 'Follow up Automation Client',
      ),
    ).toBe(true);

    const approvals = await request(app.getHttpServer())
      .get('/v1/automation/approvals')
      .set(authI)
      .expect(200);
    const approval = approvals.body.find(
      (item: { runId: string; status: string }) =>
        item.runId === waitingRunId && item.status === 'PENDING',
    );
    expect(approval).toBeTruthy();

    const completed = await request(app.getHttpServer())
      .post(
        `/v1/automation/approvals/${approval.id as string}/decision`,
      )
      .set(authI)
      .send({
        status: 'APPROVED',
        reason: 'Validated by owner.',
      })
      .expect(201);
    expect(completed.body.run.status).toBe('COMPLETED');

    const falseBranch = await request(app.getHttpServer())
      .post(`/v1/automation/workflows/${manualWorkflowId}/trigger`)
      .set(authI)
      .send({
        context: {
          score: 10,
          name: 'Low Score Client',
        },
      })
      .expect(201);
    expect(falseBranch.body.run.status).toBe('COMPLETED');

    const tasksAfterFalseBranch = await request(app.getHttpServer())
      .get('/v1/crm/tasks')
      .set(authI)
      .expect(200);
    expect(
      tasksAfterFalseBranch.body.filter(
        (item: { title: string }) =>
          item.title === 'Follow up Low Score Client',
      ),
    ).toHaveLength(0);

    const eventWorkflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authI)
      .send({
        key: 'event-follow-up',
        name: 'Event Follow Up',
        triggerType: 'EVENT',
        triggerConfig: {
          eventTypes: ['crm.test.event.v1'],
        },
      })
      .expect(201);

    const eventWorkflowId = eventWorkflow.body.workflow.id as string;
    const eventVersionId = eventWorkflow.body.version.id as string;

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${eventWorkflowId}/versions/${eventVersionId}/graph`,
      )
      .set(authI)
      .send({
        startNodeKey: 'event_task',
        nodes: [
          {
            nodeKey: 'event_task',
            nodeType: 'ACTION',
            name: 'Create event task',
            config: {
              action: 'CRM_CREATE_TASK',
              input: {
                title: 'Event {{event.payload.name}}',
                priority: 'NORMAL',
              },
            },
          },
          {
            nodeKey: 'event_end',
            nodeType: 'END',
            name: 'Done',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'event_task_end',
            sourceNodeKey: 'event_task',
            targetNodeKey: 'event_end',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${eventWorkflowId}/versions/${eventVersionId}/activate`,
      )
      .set(authI)
      .expect(201);

    const testEvent = {
      eventId: 'event-idempotency-1',
      eventType: 'crm.test.event.v1',
      aggregateType: 'contact',
      aggregateId: 'external-test-contact',
      payload: { name: 'Triggered Client' },
    };

    const firstEvent = await request(app.getHttpServer())
      .post('/v1/automation/events/process')
      .set(authI)
      .send(testEvent)
      .expect(201);
    expect(firstEvent.body[0]?.status).toBe('STARTED');

    const duplicateEvent = await request(app.getHttpServer())
      .post('/v1/automation/events/process')
      .set(authI)
      .send(testEvent)
      .expect(201);
    expect(duplicateEvent.body[0]?.status).toBe('DUPLICATE');

    const finalTasks = await request(app.getHttpServer())
      .get('/v1/crm/tasks')
      .set(authI)
      .expect(200);
    expect(
      finalTasks.body.filter(
        (item: { title: string }) =>
          item.title === 'Event Triggered Client',
      ),
    ).toHaveLength(1);

    const otherTenantWorkflows = await request(app.getHttpServer())
      .get('/v1/automation/workflows')
      .set(authJ)
      .expect(200);
    expect(otherTenantWorkflows.body).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/v1/automation/runs/${waitingRunId}`)
      .set(authJ)
      .expect(404);
  });

  it('hardens automation retries pause cancel and reconciliation safely', async () => {
    const tenantK = await register({
      email: 'automation-hardening-k@example.com',
      organizationName: 'Automation Hardening K',
      organizationSlug: 'automation-hardening-k',
    });
    const tenantL = await register({
      email: 'automation-hardening-l@example.com',
      organizationName: 'Automation Hardening L',
      organizationSlug: 'automation-hardening-l',
    });
    const authK = {
      authorization: `Bearer ${tenantK.tokens.accessToken}`,
    };
    const authL = {
      authorization: `Bearer ${tenantL.tokens.accessToken}`,
    };

    const retryWorkflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authK)
      .send({
        key: 'retry-safe-update',
        name: 'Retry Safe Update',
        triggerType: 'MANUAL',
        triggerConfig: {},
      })
      .expect(201);

    const retryWorkflowId = retryWorkflow.body.workflow.id as string;
    const retryVersionId = retryWorkflow.body.version.id as string;
    const missingLeadId = randomUUID();

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${retryWorkflowId}/versions/${retryVersionId}/graph`,
      )
      .set(authK)
      .send({
        startNodeKey: 'update_missing_lead',
        nodes: [
          {
            nodeKey: 'update_missing_lead',
            nodeType: 'ACTION',
            name: 'Update missing lead',
            config: {
              action: 'CRM_UPDATE_LEAD',
              input: {
                leadId: missingLeadId,
                status: 'QUALIFIED',
              },
              retry: {
                maxAttempts: 2,
                backoffSeconds: 1,
                multiplier: 1,
                maxBackoffSeconds: 1,
              },
            },
          },
          {
            nodeKey: 'retry_end',
            nodeType: 'END',
            name: 'Done',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'retry_to_end',
            sourceNodeKey: 'update_missing_lead',
            targetNodeKey: 'retry_end',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${retryWorkflowId}/versions/${retryVersionId}/activate`,
      )
      .set(authK)
      .expect(201);

    const retryStarted = await request(app.getHttpServer())
      .post(`/v1/automation/workflows/${retryWorkflowId}/trigger`)
      .set(authK)
      .send({ context: {} })
      .expect(201);

    expect(retryStarted.body.run.status).toBe('WAITING');
    const retryRunId = retryStarted.body.run.id as string;
    expect(retryStarted.body.steps[0]).toMatchObject({
      nodeKey: 'update_missing_lead',
      status: 'RETRY_WAIT',
      attempt: 1,
    });

    const paused = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${retryRunId}/pause`)
      .set(authK)
      .send({ reason: 'Operator inspection.' })
      .expect(201);
    expect(paused.body.status).toBe('PAUSED');

    await request(app.getHttpServer())
      .post(`/v1/automation/runs/${retryRunId}/pause`)
      .set(authL)
      .send({})
      .expect(404);

    const resumedWaiting = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${retryRunId}/resume-paused`)
      .set(authK)
      .expect(201);
    expect(resumedWaiting.body.run.status).toBe('WAITING');

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const retryFinished = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${retryRunId}/resume`)
      .set(authK)
      .expect(201);
    expect(retryFinished.body.run.status).toBe('FAILED');
    expect(
      retryFinished.body.steps.filter(
        (step: { nodeKey: string }) =>
          step.nodeKey === 'update_missing_lead',
      ),
    ).toHaveLength(2);

    const cancelWorkflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authK)
      .send({
        key: 'cancellable-wait',
        name: 'Cancellable Wait',
        triggerType: 'MANUAL',
        triggerConfig: {},
      })
      .expect(201);
    const cancelWorkflowId = cancelWorkflow.body.workflow.id as string;
    const cancelVersionId = cancelWorkflow.body.version.id as string;

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${cancelWorkflowId}/versions/${cancelVersionId}/graph`,
      )
      .set(authK)
      .send({
        startNodeKey: 'wait_cancel',
        nodes: [
          {
            nodeKey: 'wait_cancel',
            nodeType: 'WAIT',
            name: 'Wait',
            config: { durationSeconds: 60 },
          },
          {
            nodeKey: 'cancel_end',
            nodeType: 'END',
            name: 'End',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'wait_cancel_end',
            sourceNodeKey: 'wait_cancel',
            targetNodeKey: 'cancel_end',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${cancelWorkflowId}/versions/${cancelVersionId}/activate`,
      )
      .set(authK)
      .expect(201);

    const cancelStarted = await request(app.getHttpServer())
      .post(`/v1/automation/workflows/${cancelWorkflowId}/trigger`)
      .set(authK)
      .send({ context: {} })
      .expect(201);
    const cancelRunId = cancelStarted.body.run.id as string;

    const cancelled = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${cancelRunId}/cancel`)
      .set(authK)
      .send({ reason: 'No longer required.' })
      .expect(201);
    expect(cancelled.body.run.status).toBe('CANCELLED');

    const ambiguousWorkflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authK)
      .send({
        key: 'ambiguous-ai-action',
        name: 'Ambiguous AI Action',
        triggerType: 'MANUAL',
        triggerConfig: {},
      })
      .expect(201);
    const ambiguousWorkflowId =
      ambiguousWorkflow.body.workflow.id as string;
    const ambiguousVersionId =
      ambiguousWorkflow.body.version.id as string;

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${ambiguousWorkflowId}/versions/${ambiguousVersionId}/graph`,
      )
      .set(authK)
      .send({
        startNodeKey: 'bad_ai',
        nodes: [
          {
            nodeKey: 'bad_ai',
            nodeType: 'ACTION',
            name: 'Unavailable AI agent',
            config: {
              action: 'AI_RUN_AGENT',
              input: {
                agentId: randomUUID(),
                input: 'Test ambiguous action handling.',
              },
            },
          },
          {
            nodeKey: 'ambiguous_end',
            nodeType: 'END',
            name: 'End',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'bad_ai_end',
            sourceNodeKey: 'bad_ai',
            targetNodeKey: 'ambiguous_end',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${ambiguousWorkflowId}/versions/${ambiguousVersionId}/activate`,
      )
      .set(authK)
      .expect(201);

    const ambiguousStarted = await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${ambiguousWorkflowId}/trigger`,
      )
      .set(authK)
      .send({ context: {} })
      .expect(201);
    const ambiguousRunId = ambiguousStarted.body.run.id as string;
    expect(ambiguousStarted.body.run.status).toBe('ACTION_REQUIRED');

    await request(app.getHttpServer())
      .post(`/v1/automation/runs/${ambiguousRunId}/reconcile`)
      .set(authK)
      .send({
        action: 'RETRY',
        reason: 'Attempt retry without reconciliation proof.',
      })
      .expect(409);

    const reconciledCancel = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${ambiguousRunId}/reconcile`)
      .set(authK)
      .send({
        action: 'CANCEL',
        reason: 'Operator chose not to repeat an ambiguous external action.',
      })
      .expect(201);
    expect(reconciledCancel.body.run.status).toBe('CANCELLED');
  });

  it('certifies CRM AI WhatsApp follow-up and human handoff as one automation journey', async () => {
    const tenantM = await register({
      email: 'automation-certification-m@example.com',
      organizationName: 'Automation Certification M',
      organizationSlug: 'automation-certification-m',
    });
    const authM = {
      authorization: `Bearer ${tenantM.tokens.accessToken}`,
    };

    const contact = await request(app.getHttpServer())
      .post('/v1/crm/contacts')
      .set(authM)
      .send({
        displayName: 'Certified Client',
        phone: '919844444444',
        source: 'WHATSAPP',
      })
      .expect(201);

    const lead = await request(app.getHttpServer())
      .post('/v1/crm/leads')
      .set(authM)
      .send({
        title: 'Certified AI WhatsApp enquiry',
        contactId: contact.body.id,
        source: 'WHATSAPP',
        temperature: 'COLD',
      })
      .expect(201);

    const signup = await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/begin')
      .set(authM)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/communication/meta/embedded-signup/complete')
      .set(authM)
      .send({
        connectionId: signup.body.connectionId,
        signupState: signup.body.state,
        authorizationCode: 'mock-certification-code',
        businessPortfolioId: 'business-certification-m',
        wabaId: 'waba-certification-m',
        phoneNumberId: 'phone-certification-m',
        displayName: 'Certified WhatsApp',
        displayAddress: '+91 90000 00010',
      })
      .expect(201);

    const inboundPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-certification-m',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '919000000010',
                  phone_number_id: 'phone-certification-m',
                },
                contacts: [
                  {
                    profile: { name: 'Certified Client' },
                    wa_id: '919844444444',
                  },
                ],
                messages: [
                  {
                    from: '919844444444',
                    id: 'wamid.certification.inbound.1',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: {
                      body: 'I am interested. Please tell me the next step.',
                    },
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

    const conversations = await request(app.getHttpServer())
      .get('/v1/communication/conversations')
      .set(authM)
      .expect(200);
    const conversation = conversations.body.find(
      (item: { contactId: string }) => item.contactId === contact.body.id,
    );
    expect(conversation).toBeTruthy();

    const agent = await request(app.getHttpServer())
      .post('/v1/ai/agents')
      .set(authM)
      .send({
        key: 'certification-sales-agent',
        name: 'Certification Sales Agent',
        role: 'SALES_QUALIFICATION',
        instructions:
          'Qualify the current client enquiry and return a concise internal recommendation. Do not invent facts.',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/ai/agents/${agent.body.agent.id as string}/versions/${agent.body.version.id as string}/activate`,
      )
      .set(authM)
      .expect(201);

    const workflow = await request(app.getHttpServer())
      .post('/v1/automation/workflows')
      .set(authM)
      .send({
        key: 'certified-client-journey',
        name: 'Certified Client Journey',
        triggerType: 'EVENT',
        triggerConfig: {
          eventTypes: ['crm.lead.created.v1'],
        },
      })
      .expect(201);

    const workflowId = workflow.body.workflow.id as string;
    const versionId = workflow.body.version.id as string;

    await request(app.getHttpServer())
      .put(
        `/v1/automation/workflows/${workflowId}/versions/${versionId}/graph`,
      )
      .set(authM)
      .send({
        startNodeKey: 'qualify_ai',
        nodes: [
          {
            nodeKey: 'qualify_ai',
            nodeType: 'ACTION',
            name: 'AI qualification',
            config: {
              action: 'AI_RUN_AGENT',
              input: {
                agentId: agent.body.agent.id,
                contactId: '{{event.payload.contactId}}',
                conversationId: '{{event.payload.conversationId}}',
                input:
                  'Qualify lead {{event.payload.leadId}} from the active WhatsApp conversation.',
                routing: 'FAST',
              },
            },
          },
          {
            nodeKey: 'score_lead',
            nodeType: 'ACTION',
            name: 'Score lead',
            config: {
              action: 'CRM_UPDATE_LEAD',
              input: {
                leadId: '{{event.payload.leadId}}',
                temperature: 'HOT',
                score: 85,
                status: 'QUALIFIED',
              },
              retry: {
                maxAttempts: 3,
                backoffSeconds: 1,
                multiplier: 2,
                maxBackoffSeconds: 5,
              },
            },
          },
          {
            nodeKey: 'first_followup',
            nodeType: 'ACTION',
            name: 'First WhatsApp follow-up',
            config: {
              action: 'WHATSAPP_SEND_TEXT',
              input: {
                conversationId: '{{event.payload.conversationId}}',
                text:
                  'Thanks {{event.payload.name}}. Your requirement is qualified. Our team is reviewing the next step.',
              },
            },
          },
          {
            nodeKey: 'wait_followup',
            nodeType: 'WAIT',
            name: 'Wait before second follow-up',
            config: { durationSeconds: 1 },
          },
          {
            nodeKey: 'second_followup',
            nodeType: 'ACTION',
            name: 'Second WhatsApp follow-up',
            config: {
              action: 'WHATSAPP_SEND_TEXT',
              input: {
                conversationId: '{{event.payload.conversationId}}',
                text:
                  'A human specialist can now continue from here. I am handing over the conversation.',
              },
            },
          },
          {
            nodeKey: 'human_handoff',
            nodeType: 'ACTION',
            name: 'Human handoff',
            config: {
              action: 'SET_CONVERSATION_MODE',
              input: {
                conversationId: '{{event.payload.conversationId}}',
                handlingMode: 'HUMAN',
              },
            },
          },
          {
            nodeKey: 'journey_end',
            nodeType: 'END',
            name: 'Journey complete',
            config: {},
          },
        ],
        edges: [
          {
            edgeKey: 'ai_to_score',
            sourceNodeKey: 'qualify_ai',
            targetNodeKey: 'score_lead',
          },
          {
            edgeKey: 'score_to_first',
            sourceNodeKey: 'score_lead',
            targetNodeKey: 'first_followup',
          },
          {
            edgeKey: 'first_to_wait',
            sourceNodeKey: 'first_followup',
            targetNodeKey: 'wait_followup',
          },
          {
            edgeKey: 'wait_to_second',
            sourceNodeKey: 'wait_followup',
            targetNodeKey: 'second_followup',
          },
          {
            edgeKey: 'second_to_handoff',
            sourceNodeKey: 'second_followup',
            targetNodeKey: 'human_handoff',
          },
          {
            edgeKey: 'handoff_to_end',
            sourceNodeKey: 'human_handoff',
            targetNodeKey: 'journey_end',
          },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `/v1/automation/workflows/${workflowId}/versions/${versionId}/activate`,
      )
      .set(authM)
      .expect(201);

    const event = {
      eventId: 'certification-event-1',
      eventType: 'crm.lead.created.v1',
      aggregateType: 'lead',
      aggregateId: lead.body.id,
      payload: {
        leadId: lead.body.id,
        contactId: contact.body.id,
        conversationId: conversation.id,
        name: 'Certified Client',
      },
      correlationId: 'certification-journey-1',
    };

    const started = await request(app.getHttpServer())
      .post('/v1/automation/events/process')
      .set(authM)
      .send(event)
      .expect(201);
    expect(started.body[0]?.status).toBe('STARTED');

    const certifiedRunId = started.body[0].runId as string;
    const waiting = await request(app.getHttpServer())
      .get(`/v1/automation/runs/${certifiedRunId}`)
      .set(authM)
      .expect(200);
    expect(waiting.body.run.status).toBe('WAITING');
    expect(
      waiting.body.steps.some(
        (step: { nodeKey: string; status: string }) =>
          step.nodeKey === 'qualify_ai' &&
          step.status === 'COMPLETED',
      ),
    ).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const completed = await request(app.getHttpServer())
      .post(`/v1/automation/runs/${certifiedRunId}/resume`)
      .set(authM)
      .expect(201);
    expect(completed.body.run.status).toBe('COMPLETED');

    const leads = await request(app.getHttpServer())
      .get('/v1/crm/leads')
      .set(authM)
      .expect(200);
    const updatedLead = leads.body.find(
      (item: { id: string }) => item.id === lead.body.id,
    );
    expect(updatedLead).toMatchObject({
      status: 'QUALIFIED',
      temperature: 'HOT',
      score: 85,
    });

    const messages = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversation.id as string}/messages`,
      )
      .set(authM)
      .expect(200);
    expect(
      messages.body.filter(
        (item: { direction: string }) => item.direction === 'OUTBOUND',
      ),
    ).toHaveLength(2);

    const finalConversation = await request(app.getHttpServer())
      .get(`/v1/communication/conversations/${conversation.id as string}`)
      .set(authM)
      .expect(200);
    expect(finalConversation.body.handlingMode).toBe('HUMAN');

    const duplicate = await request(app.getHttpServer())
      .post('/v1/automation/events/process')
      .set(authM)
      .send(event)
      .expect(201);
    expect(duplicate.body[0]?.status).toBe('DUPLICATE');

    const messagesAfterDuplicate = await request(app.getHttpServer())
      .get(
        `/v1/communication/conversations/${conversation.id as string}/messages`,
      )
      .set(authM)
      .expect(200);
    expect(
      messagesAfterDuplicate.body.filter(
        (item: { direction: string }) => item.direction === 'OUTBOUND',
      ),
    ).toHaveLength(2);
  });

  it('gates and certifies the Real Estate extension end to end', async () => {
    const platformAdmin = await register({
      email: 'phase6-platform-admin@example.com',
      organizationName: 'Phase 6 Platform Admin',
      organizationSlug: 'phase6-platform-admin',
    });
    await pool.query(
      `update users
       set is_platform_admin = true, updated_at = now()
       where email = 'phase6-platform-admin@example.com'`,
    );
    const authAdmin = {
      authorization: `Bearer ${platformAdmin.tokens.accessToken}`,
    };

    const tenantN = await register({
      email: 'real-estate-n@example.com',
      organizationName: 'Real Estate Tenant N',
      organizationSlug: 'real-estate-tenant-n',
    });
    const tenantO = await register({
      email: 'real-estate-o@example.com',
      organizationName: 'Real Estate Tenant O',
      organizationSlug: 'real-estate-tenant-o',
    });
    const authN = {
      authorization: `Bearer ${tenantN.tokens.accessToken}`,
    };
    const authO = {
      authorization: `Bearer ${tenantO.tokens.accessToken}`,
    };

    const disabledRegistry = await request(app.getHttpServer())
      .get('/v1/extensions')
      .set(authN)
      .expect(200);
    expect(
      disabledRegistry.body.find(
        (item: { key: string }) => item.key === 'real-estate',
      )?.enabled,
    ).toBe(false);

    await request(app.getHttpServer())
      .get('/v1/real-estate/dashboard')
      .set(authN)
      .expect(403);

    const enabledForN = await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantN.organization.id}/extensions/real-estate`,
      )
      .set(authAdmin)
      .send({ enabled: true })
      .expect(200);
    expect(enabledForN.body.enabled).toBe(true);

    const enabledForO = await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantO.organization.id}/extensions/real-estate`,
      )
      .set(authAdmin)
      .send({ enabled: true })
      .expect(200);
    expect(enabledForO.body.enabled).toBe(true);

    const enabledRegistry = await request(app.getHttpServer())
      .get('/v1/extensions')
      .set(authN)
      .expect(200);
    expect(
      enabledRegistry.body.find(
        (item: { key: string }) => item.key === 'real-estate',
      )?.enabled,
    ).toBe(true);

    const aiTools = await request(app.getHttpServer())
      .get('/v1/ai/tools')
      .set(authN)
      .expect(200);
    expect(
      aiTools.body.some(
        (item: { key: string }) => item.key === 'search_properties',
      ),
    ).toBe(true);
    expect(
      aiTools.body.some(
        (item: { key: string }) => item.key === 'recommend_properties',
      ),
    ).toBe(true);
    expect(
      aiTools.body.some(
        (item: { key: string }) => item.key === 'schedule_site_visit',
      ),
    ).toBe(true);

    const contact = await request(app.getHttpServer())
      .post('/v1/crm/contacts')
      .set(authN)
      .send({
        displayName: 'Phase Six Buyer',
        phone: '919833333333',
        source: 'REAL_ESTATE',
      })
      .expect(201);

    const project = await request(app.getHttpServer())
      .post('/v1/real-estate/projects')
      .set(authN)
      .send({
        name: 'Phase Six Residences',
        city: 'Pune',
        locality: 'Baner',
        reraNumber: 'P52100000001',
        amenities: ['Parking', 'Gym', 'Clubhouse'],
        minPrice: '7000000',
        maxPrice: '15000000',
      })
      .expect(201);

    const matchingUnit = await request(app.getHttpServer())
      .post('/v1/real-estate/units')
      .set(authN)
      .send({
        projectId: project.body.id,
        title: 'Phase Six Residences · A-1203',
        unitNumber: 'A-1203',
        propertyType: 'APARTMENT',
        configuration: '2 BHK',
        carpetArea: '820',
        price: '8200000',
        amenities: ['Parking', 'Gym'],
      })
      .expect(201);

    const independentUnit = await request(app.getHttpServer())
      .post('/v1/real-estate/units')
      .set(authN)
      .send({
        title: 'Kharadi Premium 3 BHK',
        city: 'Pune',
        locality: 'Kharadi',
        propertyType: 'APARTMENT',
        configuration: '3 BHK',
        carpetArea: '1250',
        price: '14000000',
        amenities: ['Parking', 'Gym'],
      })
      .expect(201);

    const requirement = await request(app.getHttpServer())
      .post('/v1/real-estate/requirements')
      .set(authN)
      .send({
        contactId: contact.body.id,
        purpose: 'SELF_USE',
        cities: ['Pune'],
        localities: ['Baner'],
        propertyTypes: ['APARTMENT'],
        configurations: ['2 BHK'],
        minBudget: '7000000',
        maxBudget: '9000000',
        minCarpetArea: '750',
        mustHaveAmenities: ['Parking'],
        purchaseTimeline: '0-3 months',
      })
      .expect(201);

    const matched = await request(app.getHttpServer())
      .post(
        `/v1/real-estate/requirements/${requirement.body.id as string}/match`,
      )
      .set(authN)
      .send({ limit: 10 })
      .expect(201);

    expect(matched.body).toHaveLength(1);
    expect(matched.body[0].unit.id).toBe(matchingUnit.body.id);
    expect(matched.body[0].score).toBe(100);
    expect(matched.body[0].reasons).toContain('Preferred locality');

    const persistedMatches = await request(app.getHttpServer())
      .get(
        `/v1/real-estate/requirements/${requirement.body.id as string}/matches`,
      )
      .set(authN)
      .expect(200);
    expect(persistedMatches.body).toHaveLength(1);
    expect(persistedMatches.body[0].unit.id).toBe(matchingUnit.body.id);

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const visit = await request(app.getHttpServer())
      .post('/v1/real-estate/site-visits')
      .set(authN)
      .send({
        requirementId: requirement.body.id,
        contactId: contact.body.id,
        projectId: project.body.id,
        unitId: matchingUnit.body.id,
        scheduledAt: scheduledAt.toISOString(),
        notes: 'Buyer requested afternoon visit.',
      })
      .expect(201);

    expect(visit.body.status).toBe('SCHEDULED');
    expect(visit.body.appointment.id).toBeTruthy();

    const completedVisit = await request(app.getHttpServer())
      .patch(
        `/v1/real-estate/site-visits/${visit.body.id as string}`,
      )
      .set(authN)
      .send({
        status: 'COMPLETED',
        outcome: 'INTERESTED',
      })
      .expect(200);
    expect(completedVisit.body.status).toBe('COMPLETED');

    const independentVisit = await request(app.getHttpServer())
      .post('/v1/real-estate/site-visits')
      .set(authN)
      .send({
        contactId: contact.body.id,
        unitId: independentUnit.body.id,
        scheduledAt: new Date(
          scheduledAt.getTime() + 2 * 60 * 60 * 1000,
        ).toISOString(),
        notes: 'Standalone resale property visit.',
      })
      .expect(201);
    expect(independentVisit.body.projectId).toBeNull();
    expect(independentVisit.body.unitId).toBe(independentUnit.body.id);
    expect(independentVisit.body.appointment.location).toContain('Kharadi');

    const booking = await request(app.getHttpServer())
      .post('/v1/real-estate/bookings')
      .set(authN)
      .send({
        contactId: contact.body.id,
        requirementId: requirement.body.id,
        unitId: matchingUnit.body.id,
        bookingAmount: '100000',
      })
      .expect(201);
    expect(booking.body.status).toBe('RESERVED');

    const reservedInventory = await request(app.getHttpServer())
      .get('/v1/real-estate/units?limit=100')
      .set(authN)
      .expect(200);
    expect(
      reservedInventory.body.find(
        (item: { unit: { id: string } }) =>
          item.unit.id === matchingUnit.body.id,
      )?.unit.inventoryStatus,
    ).toBe('HOLD');

    const confirmed = await request(app.getHttpServer())
      .patch(
        `/v1/real-estate/bookings/${booking.body.id as string}`,
      )
      .set(authN)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .patch(
        `/v1/real-estate/bookings/${booking.body.id as string}`,
      )
      .set(authN)
      .send({ status: 'RESERVED' })
      .expect(409);

    const bookedInventory = await request(app.getHttpServer())
      .get('/v1/real-estate/units?limit=100')
      .set(authN)
      .expect(200);
    expect(
      bookedInventory.body.find(
        (item: { unit: { id: string } }) =>
          item.unit.id === matchingUnit.body.id,
      )?.unit.inventoryStatus,
    ).toBe('BOOKED');

    await request(app.getHttpServer())
      .post('/v1/real-estate/bookings')
      .set(authN)
      .send({
        contactId: contact.body.id,
        unitId: matchingUnit.body.id,
        bookingAmount: '100000',
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/v1/real-estate/units/${matchingUnit.body.id as string}`)
      .set(authO)
      .send({ price: '1' })
      .expect(404);

    const dashboard = await request(app.getHttpServer())
      .get('/v1/real-estate/dashboard')
      .set(authN)
      .expect(200);
    expect(dashboard.body).toMatchObject({
      projects: 1,
      availableUnits: 1,
      activeRequirements: 0,
      bookings: 1,
    });

    const disabledForN = await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantN.organization.id}/extensions/real-estate`,
      )
      .set(authAdmin)
      .send({ enabled: false })
      .expect(200);
    expect(disabledForN.body.enabled).toBe(false);

    await request(app.getHttpServer())
      .get('/v1/real-estate/dashboard')
      .set(authN)
      .expect(403);
  });

  it('gates and certifies Attendance & Employee Operations end to end', async () => {
    const platformAdmin = await register({
      email: 'phase7-platform-admin@example.com',
      organizationName: 'Phase 7 Platform Admin',
      organizationSlug: 'phase7-platform-admin',
    });
    await pool.query(
      `update users
       set is_platform_admin = true, updated_at = now()
       where email = 'phase7-platform-admin@example.com'`,
    );
    const authAdmin = {
      authorization: `Bearer ${platformAdmin.tokens.accessToken}`,
    };

    const tenantP = await register({
      email: 'attendance-p@example.com',
      organizationName: 'Attendance Tenant P',
      organizationSlug: 'attendance-tenant-p',
    });
    const tenantQ = await register({
      email: 'attendance-q@example.com',
      organizationName: 'Attendance Tenant Q',
      organizationSlug: 'attendance-tenant-q',
    });
    const authP = {
      authorization: `Bearer ${tenantP.tokens.accessToken}`,
    };
    const authQ = {
      authorization: `Bearer ${tenantQ.tokens.accessToken}`,
    };

    const disabledRegistry = await request(app.getHttpServer())
      .get('/v1/extensions')
      .set(authP)
      .expect(200);
    expect(
      disabledRegistry.body.find(
        (item: { key: string }) => item.key === 'attendance',
      )?.enabled,
    ).toBe(false);

    await request(app.getHttpServer())
      .get('/v1/attendance/dashboard')
      .set(authP)
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantP.organization.id}/extensions/attendance`,
      )
      .set(authAdmin)
      .send({ enabled: true })
      .expect(200);
    await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantQ.organization.id}/extensions/attendance`,
      )
      .set(authAdmin)
      .send({ enabled: true })
      .expect(200);

    const enabledRegistry = await request(app.getHttpServer())
      .get('/v1/extensions')
      .set(authP)
      .expect(200);
    expect(
      enabledRegistry.body.find(
        (item: { key: string }) => item.key === 'attendance',
      )?.enabled,
    ).toBe(true);

    const membershipRows = (await pool.query(
      `select om.id
       from organization_members om
       join users u on u.id = om.user_id
       where om.organization_id = '${tenantP.organization.id}'
         and u.email = 'attendance-p@example.com'
       limit 1`,
    )) as { rows: Array<{ id: string }> };
    const ownerMembershipId = membershipRows.rows[0]?.id;
    expect(ownerMembershipId).toBeTruthy();

    const department = await request(app.getHttpServer())
      .post('/v1/attendance/departments')
      .set(authP)
      .send({
        name: 'Sales',
        code: 'SALES',
      })
      .expect(201);

    const employee = await request(app.getHttpServer())
      .post('/v1/attendance/employees')
      .set(authP)
      .send({
        employeeCode: 'EMP-001',
        displayName: 'Phase Seven Owner',
        email: 'attendance-p@example.com',
        departmentId: department.body.id,
        organizationMemberId: ownerMembershipId,
        designation: 'Sales Manager',
      })
      .expect(201);
    expect(employee.body.organizationMemberId).toBe(ownerMembershipId);

    const secondEmployee = await request(app.getHttpServer())
      .post('/v1/attendance/employees')
      .set(authP)
      .send({
        employeeCode: 'EMP-002',
        displayName: 'Phase Seven Teammate',
        departmentId: department.body.id,
        designation: 'Sales Executive',
      })
      .expect(201);

    const nightEmployee = await request(app.getHttpServer())
      .post('/v1/attendance/employees')
      .set(authP)
      .send({
        employeeCode: 'EMP-003',
        displayName: 'Phase Seven Night Shift',
        departmentId: department.body.id,
        designation: 'Night Operations',
      })
      .expect(201);

    const shift = await request(app.getHttpServer())
      .post('/v1/attendance/shifts')
      .set(authP)
      .send({
        name: 'General Shift',
        code: 'GEN',
        timezone: 'Asia/Kolkata',
        startTime: '09:00',
        endTime: '18:00',
        breakMinutes: 60,
        graceMinutes: 10,
        weeklyOffDays: [0],
      })
      .expect(201);
    expect(shift.body.expectedMinutes).toBe(480);

    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) =>
      todayParts.find((item) => item.type === type)?.value ?? '';
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const dayBeforeYesterdayDate = new Date(
      `${today}T00:00:00.000Z`,
    );
    dayBeforeYesterdayDate.setUTCDate(
      dayBeforeYesterdayDate.getUTCDate() - 2,
    );
    const dayBeforeYesterday = dayBeforeYesterdayDate
      .toISOString()
      .slice(0, 10);
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const dayAfterDate = new Date(`${today}T00:00:00.000Z`);
    dayAfterDate.setUTCDate(dayAfterDate.getUTCDate() + 2);
    const dayAfter = dayAfterDate.toISOString().slice(0, 10);

    await request(app.getHttpServer())
      .post('/v1/attendance/shift-assignments')
      .set(authP)
      .send({
        employeeId: employee.body.id,
        shiftId: shift.body.id,
        effectiveFrom: today,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/attendance/shift-assignments')
      .set(authP)
      .send({
        employeeId: employee.body.id,
        shiftId: shift.body.id,
        effectiveFrom: today,
      })
      .expect(409);

    const nightShift = await request(app.getHttpServer())
      .post('/v1/attendance/shifts')
      .set(authP)
      .send({
        name: 'Night Shift',
        code: 'NIGHT',
        timezone: 'Asia/Kolkata',
        startTime: '22:00',
        endTime: '06:00',
        breakMinutes: 30,
        graceMinutes: 10,
        weeklyOffDays: [],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/attendance/shift-assignments')
      .set(authP)
      .send({
        employeeId: nightEmployee.body.id,
        shiftId: nightShift.body.id,
        effectiveFrom: dayBeforeYesterday,
      })
      .expect(201);

    const overnightCheckIn = await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${nightEmployee.body.id as string}/check-in`,
      )
      .set(authP)
      .send({
        occurredAt: `${yesterday}T01:00:00+05:30`,
      })
      .expect(201);
    expect(overnightCheckIn.body.record.attendanceDate).toBe(
      dayBeforeYesterday,
    );

    await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${nightEmployee.body.id as string}/check-out`,
      )
      .set(authP)
      .send({
        occurredAt: `${yesterday}T02:00:00+05:30`,
      })
      .expect(201);

    const policy = await request(app.getHttpServer())
      .post('/v1/attendance/policies')
      .set(authP)
      .send({
        name: 'Office Geofence',
        isDefault: true,
        locationValidationMode: 'REQUIRED',
        latitude: '18.5204000',
        longitude: '73.8567000',
        radiusMeters: 300,
        maxAccuracyMeters: 100,
        allowRemote: false,
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
        maxShiftHours: 16,
      })
      .expect(201);
    expect(policy.body.locationValidationMode).toBe('REQUIRED');
    expect(policy.body.maxAccuracyMeters).toBe(100);

    await request(app.getHttpServer())
      .post('/v1/attendance/me/check-in')
      .set(authP)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/attendance/me/check-in')
      .set(authP)
      .send({
        latitude: '18.0000000',
        longitude: '73.0000000',
        accuracyMeters: 20,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/attendance/me/check-in')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 500,
      })
      .expect(400);

    const checkedIn = await request(app.getHttpServer())
      .post('/v1/attendance/me/check-in')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 20,
        idempotencyKey: 'phase7-checkin-001',
        source: 'MOBILE',
      })
      .expect(201);
    expect(checkedIn.body.event.locationValidation).toBe('VALID');
    expect(checkedIn.body.record.firstCheckInAt).toBeTruthy();

    const duplicateCheckIn = await request(app.getHttpServer())
      .post('/v1/attendance/me/check-in')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 20,
        idempotencyKey: 'phase7-checkin-001',
        source: 'MOBILE',
      })
      .expect(201);
    expect(duplicateCheckIn.body.idempotent).toBe(true);
    expect(duplicateCheckIn.body.event.id).toBe(checkedIn.body.event.id);

    await request(app.getHttpServer())
      .post('/v1/attendance/me/check-out')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 20,
        idempotencyKey: 'phase7-checkin-001',
        source: 'MOBILE',
      })
      .expect(409);

    const checkedOut = await request(app.getHttpServer())
      .post('/v1/attendance/me/check-out')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 20,
        idempotencyKey: 'phase7-checkout-001',
        source: 'MOBILE',
      })
      .expect(201);
    expect(checkedOut.body.event.locationValidation).toBe('VALID');
    expect(checkedOut.body.record.lastCheckOutAt).toBeTruthy();

    await request(app.getHttpServer())
      .post('/v1/attendance/me/check-out')
      .set(authP)
      .send({
        latitude: '18.5204000',
        longitude: '73.8567000',
        accuracyMeters: 20,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${secondEmployee.body.id as string}/check-in`,
      )
      .set(authP)
      .send({
        occurredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(400);

    const managerCheckIn = await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${secondEmployee.body.id as string}/check-in`,
      )
      .set(authP)
      .send({
        occurredAt: `${today}T10:00:00+05:30`,
      })
      .expect(201);
    expect(managerCheckIn.body.event.locationValidation).toBe(
      'ADMIN_OVERRIDE',
    );

    const managerCheckOut = await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${secondEmployee.body.id as string}/check-out`,
      )
      .set(authP)
      .send({
        occurredAt: `${today}T11:00:00+05:30`,
      })
      .expect(201);
    expect(managerCheckOut.body.event.locationValidation).toBe(
      'ADMIN_OVERRIDE',
    );

    await request(app.getHttpServer())
      .post(
        `/v1/attendance/employees/${secondEmployee.body.id as string}/leaves`,
      )
      .set(authP)
      .send({
        leaveType: 'CASUAL',
        startDate: tomorrow,
        endDate: tomorrow,
        requestedDays: '2',
      })
      .expect(400);

    const leave = await request(app.getHttpServer())
      .post('/v1/attendance/me/leaves')
      .set(authP)
      .send({
        leaveType: 'CASUAL',
        startDate: tomorrow,
        endDate: tomorrow,
        reason: 'Personal work',
      })
      .expect(201);
    expect(leave.body.status).toBe('PENDING');

    const approvedLeave = await request(app.getHttpServer())
      .patch(
        `/v1/attendance/leaves/${leave.body.id as string}/decision`,
      )
      .set(authP)
      .send({ status: 'APPROVED' })
      .expect(200);
    expect(approvedLeave.body.status).toBe('APPROVED');

    await request(app.getHttpServer())
      .patch(
        `/v1/attendance/leaves/${leave.body.id as string}/decision`,
      )
      .set(authP)
      .send({ status: 'REJECTED' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/v1/attendance/holidays')
      .set(authP)
      .send({
        holidayDate: dayAfter,
        name: 'Phase Seven Holiday',
        holidayType: 'COMPANY',
        isPaid: true,
      })
      .expect(201);

    const reconciliation = await request(app.getHttpServer())
      .post('/v1/attendance/reconcile')
      .set(authP)
      .send({ date: tomorrow })
      .expect(201);
    expect(reconciliation.body.createdCount).toBe(3);
    expect(
      reconciliation.body.records.find(
        (row: { employeeId: string }) => row.employeeId === employee.body.id,
      )?.status,
    ).toBe('LEAVE');
    expect(
      reconciliation.body.records.find(
        (row: { employeeId: string }) =>
          row.employeeId === secondEmployee.body.id,
      )?.status,
    ).toBe('ABSENT');

    const report = await request(app.getHttpServer())
      .get(
        `/v1/attendance/reports/summary?from=${today}&to=${tomorrow}`,
      )
      .set(authP)
      .expect(200);
    const ownerReport = report.body.rows.find(
      (row: { employeeId: string }) => row.employeeId === employee.body.id,
    );
    expect(ownerReport).toBeTruthy();
    expect(Number(ownerReport.leaveDays)).toBe(1);

    const dashboard = await request(app.getHttpServer())
      .get(`/v1/attendance/dashboard?date=${today}`)
      .set(authP)
      .expect(200);
    expect(dashboard.body.employees).toBe(3);
    expect(dashboard.body.present).toBe(2);
    expect(dashboard.body.notMarked).toBe(1);

    await request(app.getHttpServer())
      .patch(
        `/v1/attendance/employees/${employee.body.id as string}`,
      )
      .set(authQ)
      .send({ displayName: 'Cross Tenant Attack' })
      .expect(404);

    const disabledForP = await request(app.getHttpServer())
      .put(
        `/v1/platform-admin/organizations/${tenantP.organization.id}/extensions/attendance`,
      )
      .set(authAdmin)
      .send({ enabled: false })
      .expect(200);
    expect(disabledForP.body.enabled).toBe(false);

    await request(app.getHttpServer())
      .get('/v1/attendance/dashboard')
      .set(authP)
      .expect(403);
  });
});
