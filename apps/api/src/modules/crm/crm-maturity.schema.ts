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
  workspaces,
} from '../../platform/database/schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const leadScoringRules = pgTable(
  'crm_lead_scoring_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 180 }).notNull(),
    field: varchar('field', { length: 180 }).notNull(),
    operator: varchar('operator', { length: 40 }).notNull(),
    comparisonValue: jsonb('comparison_value').$type<unknown>(),
    points: integer('points').notNull(),
    decayDays: integer('decay_days'),
    priority: integer('priority').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_lead_scoring_rules_org_workspace_idx').on(
      table.organizationId,
      table.workspaceId,
      table.isActive,
    ),
    uniqueIndex('crm_lead_scoring_rules_org_workspace_name_uq').on(
      table.organizationId,
      table.workspaceId,
      table.name,
    ),
  ],
);

export const crmDataJobs = pgTable(
  'crm_data_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requestedByMemberId: uuid('requested_by_member_id')
      .notNull()
      .references(() => organizationMembers.id, { onDelete: 'cascade' }),
    direction: varchar('direction', { length: 16 }).notNull(),
    objectType: varchar('object_type', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    duplicateStrategy: varchar('duplicate_strategy', { length: 24 })
      .default('SKIP')
      .notNull(),
    mapping: jsonb('mapping').$type<Record<string, string>>(),
    columns: jsonb('columns').$type<string[]>(),
    filter: jsonb('filter').$type<Record<string, unknown>>(),
    totalRows: integer('total_rows').default(0).notNull(),
    processedRows: integer('processed_rows').default(0).notNull(),
    succeededRows: integer('succeeded_rows').default(0).notNull(),
    failedRows: integer('failed_rows').default(0).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_data_jobs_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('crm_data_jobs_status_created_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const crmDataJobRows = pgTable(
  'crm_data_job_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => crmDataJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    status: varchar('status', { length: 24 }).default('PENDING').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    objectId: uuid('object_id'),
    error: text('error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('crm_data_job_rows_job_row_uq').on(
      table.jobId,
      table.rowNumber,
    ),
    index('crm_data_job_rows_job_status_idx').on(table.jobId, table.status),
  ],
);
