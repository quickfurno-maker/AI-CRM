import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
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
    const memory = newDb({ autoCreateForeignKeyIndices: true });
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
        if (statement.trim()) await pool.query(statement);
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    app = moduleRef.createNestApplication();
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
});
