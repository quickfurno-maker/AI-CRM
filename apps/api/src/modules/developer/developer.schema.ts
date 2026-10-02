import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  organizationMembers,
  organizations,
} from '../../platform/database/schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const developerOauthClients = pgTable(
  'developer_oauth_clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    clientId: varchar('client_id', { length: 96 }).notNull(),
    clientSecretHash: varchar('client_secret_hash', { length: 128 }).notNull(),
    clientSecretPrefix: varchar('client_secret_prefix', { length: 24 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    grantTypes: jsonb('grant_types')
      .$type<string[]>()
      .default(['client_credentials'])
      .notNull(),
    redirectUris: jsonb('redirect_uris').$type<string[]>().default([]).notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('developer_oauth_clients_client_id_uq').on(table.clientId),
    index('developer_oauth_clients_org_idx').on(table.organizationId),
  ],
);

export const developerOauthTokens = pgTable(
  'developer_oauth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => developerOauthClients.id, { onDelete: 'cascade' }),
    tokenPrefix: varchar('token_prefix', { length: 24 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('developer_oauth_tokens_hash_uq').on(table.tokenHash),
    index('developer_oauth_tokens_org_idx').on(table.organizationId),
    index('developer_oauth_tokens_client_idx').on(table.clientId),
  ],
);

export const developerWebhookEndpoints = pgTable(
  'developer_webhook_endpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 160 }).notNull(),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().default([]).notNull(),
    signingSecretCiphertext: text('signing_secret_ciphertext').notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('developer_webhook_endpoints_org_idx').on(table.organizationId),
    index('developer_webhook_endpoints_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const developerWebhookDeliveries = pgTable(
  'developer_webhook_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => developerWebhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 180 }).notNull(),
    eventVersion: integer('event_version').default(1).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    processingStartedAt: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('developer_webhook_deliveries_endpoint_event_uq').on(
      table.endpointId,
      table.eventId,
    ),
    index('developer_webhook_deliveries_retry_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    index('developer_webhook_deliveries_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const marketplaceExtensions = pgTable(
  'marketplace_extensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 120 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    version: varchar('version', { length: 40 }).notNull(),
    publisher: varchar('publisher', { length: 180 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 80 }).default('INTEGRATION').notNull(),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    requiredScopes: jsonb('required_scopes').$type<string[]>().default([]).notNull(),
    eventSubscriptions: jsonb('event_subscriptions')
      .$type<string[]>()
      .default([])
      .notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    isFirstParty: boolean('is_first_party').default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('marketplace_extensions_key_version_uq').on(
      table.key,
      table.version,
    ),
    index('marketplace_extensions_status_idx').on(table.status),
  ],
);

export const marketplaceInstallations = pgTable(
  'marketplace_installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => marketplaceExtensions.id, { onDelete: 'restrict' }),
    installedByMemberId: uuid('installed_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    grantedScopes: jsonb('granted_scopes').$type<string[]>().default([]).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    installedAt: timestamp('installed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('marketplace_installations_org_extension_uq').on(
      table.organizationId,
      table.extensionId,
    ),
    index('marketplace_installations_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
