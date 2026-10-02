import {
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

export const automationWorkflows = pgTable(
  'automation_workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('automation_workflows_org_workspace_key_uq').on(
      table.organizationId,
      table.workspaceId,
      table.key,
    ),
    index('automation_workflows_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const automationWorkflowVersions = pgTable(
  'automation_workflow_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    triggerType: varchar('trigger_type', { length: 32 })
      .default('EVENT')
      .notNull(),
    triggerConfig: jsonb('trigger_config')
      .$type<Record<string, unknown>>()
      .notNull(),
    startNodeKey: varchar('start_node_key', { length: 100 }),
    maxSteps: integer('max_steps').default(100).notNull(),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('automation_workflow_versions_workflow_version_uq').on(
      table.workflowId,
      table.version,
    ),
    index('automation_workflow_versions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
export const automationNodes = pgTable(
  'automation_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => automationWorkflowVersions.id, {
        onDelete: 'cascade',
      }),
    nodeKey: varchar('node_key', { length: 100 }).notNull(),
    nodeType: varchar('node_type', { length: 32 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    positionX: integer('position_x').default(0).notNull(),
    positionY: integer('position_y').default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('automation_nodes_version_key_uq').on(
      table.workflowVersionId,
      table.nodeKey,
    ),
    index('automation_nodes_org_version_idx').on(
      table.organizationId,
      table.workflowVersionId,
    ),
  ],
);

export const automationEdges = pgTable(
  'automation_edges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => automationWorkflowVersions.id, {
        onDelete: 'cascade',
      }),
    edgeKey: varchar('edge_key', { length: 120 }).notNull(),
    sourceNodeKey: varchar('source_node_key', { length: 100 }).notNull(),
    targetNodeKey: varchar('target_node_key', { length: 100 }).notNull(),
    branchKey: varchar('branch_key', { length: 64 }).default('DEFAULT').notNull(),
    priority: integer('priority').default(0).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('automation_edges_version_key_uq').on(
      table.workflowVersionId,
      table.edgeKey,
    ),
    index('automation_edges_version_source_idx').on(
      table.workflowVersionId,
      table.sourceNodeKey,
      table.priority,
    ),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => automationWorkflows.id, { onDelete: 'cascade' }),
    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => automationWorkflowVersions.id, {
        onDelete: 'restrict',
      }),
    status: varchar('status', { length: 32 }).default('RUNNING').notNull(),
    triggerType: varchar('trigger_type', { length: 32 }).notNull(),
    triggerEventId: varchar('trigger_event_id', { length: 180 }),
    triggerEventType: varchar('trigger_event_type', { length: 180 }),
    currentNodeKey: varchar('current_node_key', { length: 100 }),
    context: jsonb('context').$type<Record<string, unknown>>().notNull(),
    wakeAt: timestamp('wake_at', { withTimezone: true }),
    stepsExecuted: integer('steps_executed').default(0).notNull(),
    correlationId: varchar('correlation_id', { length: 100 }),
    causationId: varchar('causation_id', { length: 100 }),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('automation_runs_org_status_wake_idx').on(
      table.organizationId,
      table.status,
      table.wakeAt,
    ),
    index('automation_runs_workflow_created_idx').on(
      table.workflowId,
      table.createdAt,
    ),
  ],
);
export const automationStepRuns = pgTable(
  'automation_step_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => automationNodes.id, { onDelete: 'restrict' }),
    nodeKey: varchar('node_key', { length: 100 }).notNull(),
    nodeType: varchar('node_type', { length: 32 }).notNull(),
    attempt: integer('attempt').default(1).notNull(),
    status: varchar('status', { length: 32 }).default('RUNNING').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    wakeAt: timestamp('wake_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('automation_step_runs_run_created_idx').on(
      table.runId,
      table.createdAt,
    ),
    index('automation_step_runs_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const automationApprovals = pgTable(
  'automation_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    stepRunId: uuid('step_run_id')
      .notNull()
      .references(() => automationStepRuns.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    description: text('description'),
    requestedByType: varchar('requested_by_type', { length: 32 })
      .default('AUTOMATION')
      .notNull(),
    decidedByMemberId: uuid('decided_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    reason: text('reason'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('automation_approvals_org_status_idx').on(
      table.organizationId,
      table.status,
      table.requestedAt,
    ),
  ],
);

export const automationEventReceipts = pgTable(
  'automation_event_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowVersionId: uuid('workflow_version_id')
      .notNull()
      .references(() => automationWorkflowVersions.id, {
        onDelete: 'cascade',
      }),
    eventId: varchar('event_id', { length: 180 }).notNull(),
    eventType: varchar('event_type', { length: 180 }).notNull(),
    runId: uuid('run_id').references(() => automationRuns.id, {
      onDelete: 'set null',
    }),
    receivedAt: createdAt(),
  },
  (table) => [
    uniqueIndex('automation_event_receipts_version_event_uq').on(
      table.workflowVersionId,
      table.eventId,
    ),
    index('automation_event_receipts_org_event_idx').on(
      table.organizationId,
      table.eventType,
      table.receivedAt,
    ),
  ],
);
