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

export const enterpriseSecurityPolicies = pgTable(
  'enterprise_security_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    enforceIpAllowlist: boolean('enforce_ip_allowlist').default(false).notNull(),
    ipAllowlist: jsonb('ip_allowlist').$type<string[]>().default([]).notNull(),
    allowedEmailDomains: jsonb('allowed_email_domains')
      .$type<string[]>()
      .default([])
      .notNull(),
    sessionMaxMinutes: integer('session_max_minutes').default(10080).notNull(),
    auditRetentionDays: integer('audit_retention_days').default(3650).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('enterprise_security_policies_org_uq').on(
      table.organizationId,
    ),
  ],
);

export const enterpriseIdentityConnections = pgTable(
  'enterprise_identity_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    providerType: varchar('provider_type', { length: 32 }).default('OIDC').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    issuerUrl: text('issuer_url').notNull(),
    clientId: varchar('client_id', { length: 240 }).notNull(),
    clientSecretCiphertext: text('client_secret_ciphertext').notNull(),
    domains: jsonb('domains').$type<string[]>().default([]).notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('enterprise_identity_connections_org_idx').on(table.organizationId),
    index('enterprise_identity_connections_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const enterpriseIdentityLinks = pgTable(
  'enterprise_identity_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => enterpriseIdentityConnections.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 320 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('enterprise_identity_links_connection_subject_uq').on(
      table.connectionId,
      table.subject,
    ),
    uniqueIndex('enterprise_identity_links_connection_user_uq').on(
      table.connectionId,
      table.userId,
    ),
    index('enterprise_identity_links_org_idx').on(table.organizationId),
  ],
);

export const enterpriseOidcStates = pgTable(
  'enterprise_oidc_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => enterpriseIdentityConnections.id, { onDelete: 'cascade' }),
    stateHash: varchar('state_hash', { length: 128 }).notNull(),
    codeVerifierCiphertext: text('code_verifier_ciphertext').notNull(),
    returnTo: text('return_to').default('/dashboard').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('enterprise_oidc_states_hash_uq').on(table.stateHash),
    index('enterprise_oidc_states_expiry_idx').on(table.expiresAt),
  ],
);

export const enterpriseSsoLoginCodes = pgTable(
  'enterprise_sso_login_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => enterpriseIdentityConnections.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    returnTo: text('return_to').default('/dashboard').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('enterprise_sso_login_codes_hash_uq').on(table.codeHash),
    index('enterprise_sso_login_codes_expiry_idx').on(table.expiresAt),
  ],
);

export const enterpriseScimTokens = pgTable(
  'enterprise_scim_tokens',
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
    tokenPrefix: varchar('token_prefix', { length: 24 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('enterprise_scim_tokens_hash_uq').on(table.tokenHash),
    index('enterprise_scim_tokens_org_idx').on(table.organizationId),
  ],
);
