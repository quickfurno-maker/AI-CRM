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
  users,
} from '../../platform/database/schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const tenantOnboardingStates = pgTable(
  'tenant_onboarding_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('tenant_onboarding_states_org_uq').on(table.organizationId),
  ],
);

export const tenantNotifications = pgTable(
  'tenant_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').references(
      () => organizationMembers.id,
      { onDelete: 'cascade' },
    ),
    category: varchar('category', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 24 }).default('INFO').notNull(),
    title: varchar('title', { length: 220 }).notNull(),
    body: text('body').notNull(),
    actionHref: text('action_href'),
    status: varchar('status', { length: 24 }).default('UNREAD').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 240 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('tenant_notifications_org_dedupe_uq').on(
      table.organizationId,
      table.dedupeKey,
    ),
    index('tenant_notifications_member_status_idx').on(
      table.organizationId,
      table.membershipId,
      table.status,
    ),
    index('tenant_notifications_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'restrict' }),
    assignedProviderUserId: uuid('assigned_provider_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    ticketNumber: varchar('ticket_number', { length: 64 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    priority: varchar('priority', { length: 24 }).default('NORMAL').notNull(),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    subject: varchar('subject', { length: 240 }).notNull(),
    description: text('description').notNull(),
    relatedResourceType: varchar('related_resource_type', { length: 80 }),
    relatedResourceId: varchar('related_resource_id', { length: 180 }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('support_tickets_number_uq').on(table.ticketNumber),
    index('support_tickets_org_status_idx').on(
      table.organizationId,
      table.status,
      table.lastActivityAt,
    ),
    index('support_tickets_provider_status_idx').on(
      table.status,
      table.priority,
      table.lastActivityAt,
    ),
  ],
);

export const supportTicketComments = pgTable(
  'support_ticket_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorType: varchar('author_type', { length: 24 }).notNull(),
    authorId: uuid('author_id'),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').default(false).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('support_ticket_comments_ticket_created_idx').on(
      table.ticketId,
      table.createdAt,
    ),
  ],
);

export const dataGovernancePolicies = pgTable(
  'data_governance_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    auditRetentionDays: integer('audit_retention_days').default(3650).notNull(),
    notificationRetentionDays: integer('notification_retention_days')
      .default(365)
      .notNull(),
    supportRetentionDays: integer('support_retention_days').default(1095).notNull(),
    aiTraceRetentionDays: integer('ai_trace_retention_days').default(365).notNull(),
    deletionGraceDays: integer('deletion_grace_days').default(30).notNull(),
    legalHold: boolean('legal_hold').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('data_governance_policies_org_uq').on(table.organizationId),
  ],
);

export const dataGovernanceRequests = pgTable(
  'data_governance_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requestedByMemberId: uuid('requested_by_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'restrict' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestType: varchar('request_type', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING_REVIEW').notNull(),
    reason: text('reason'),
    reviewNote: text('review_note'),
    manifest: jsonb('manifest').$type<Record<string, unknown>>(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('data_governance_requests_org_status_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index('data_governance_requests_status_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);
