import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import {
  organizationMembers,
  organizations,
  workspaces,
} from '../../platform/database/schema.js';
import { contacts } from '../crm/crm.schema.js';
import { conversations } from '../communication/communication.schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const aiAgents = pgTable(
  'ai_agents',
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
    role: varchar('role', { length: 80 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    defaultHandlingMode: varchar('default_handling_mode', { length: 32 })
      .default('AI_ASSIST')
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_agents_org_workspace_key_uq').on(
      table.organizationId,
      table.workspaceId,
      table.key,
    ),
    index('ai_agents_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const aiAgentVersions = pgTable(
  'ai_agent_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    provider: varchar('provider', { length: 32 }).default('OPENAI').notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    instructions: text('instructions').notNull(),
    modelSettings: jsonb('model_settings').$type<Record<string, unknown>>(),
    knowledgePolicy: jsonb('knowledge_policy').$type<Record<string, unknown>>(),
    guardrailPolicy: jsonb('guardrail_policy').$type<Record<string, unknown>>(),
    approvalPolicy: jsonb('approval_policy').$type<Record<string, unknown>>(),
    promptHash: varchar('prompt_hash', { length: 64 }).notNull(),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_agent_versions_agent_version_uq').on(
      table.agentId,
      table.version,
    ),
    index('ai_agent_versions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
export const aiSessions = pgTable(
  'ai_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id').references(
      () => conversations.id,
      { onDelete: 'set null' },
    ),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    providerState: jsonb('provider_state').$type<Record<string, unknown>>(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('ai_sessions_org_agent_idx').on(
      table.organizationId,
      table.agentId,
    ),
    index('ai_sessions_org_conversation_idx').on(
      table.organizationId,
      table.conversationId,
    ),
  ],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => aiSessions.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => aiAgentVersions.id, { onDelete: 'restrict' }),
    conversationId: uuid('conversation_id').references(
      () => conversations.id,
      { onDelete: 'set null' },
    ),
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 32 }).default('RUNNING').notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    openaiResponseId: varchar('openai_response_id', { length: 220 }),
    traceId: varchar('trace_id', { length: 220 }),
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    promptTokens: integer('prompt_tokens').default(0).notNull(),
    completionTokens: integer('completion_tokens').default(0).notNull(),
    totalTokens: integer('total_tokens').default(0).notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', {
      precision: 14,
      scale: 6,
    }),
    latencyMs: integer('latency_ms'),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: text('failure_message'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('ai_runs_org_started_idx').on(
      table.organizationId,
      table.startedAt,
    ),
    index('ai_runs_session_idx').on(table.sessionId, table.startedAt),
    index('ai_runs_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);
export const aiToolDefinitions = pgTable(
  'ai_tool_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: varchar('key', { length: 120 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description').notNull(),
    riskLevel: varchar('risk_level', { length: 16 }).notNull(),
    handlerKey: varchar('handler_key', { length: 160 }).notNull(),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    isSystem: boolean('is_system').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_tool_definitions_key_uq').on(table.key),
  ],
);

export const aiAgentToolPolicies = pgTable(
  'ai_agent_tool_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => aiAgentVersions.id, { onDelete: 'cascade' }),
    toolDefinitionId: uuid('tool_definition_id')
      .notNull()
      .references(() => aiToolDefinitions.id, { onDelete: 'restrict' }),
    mode: varchar('mode', { length: 24 }).default('DISABLED').notNull(),
    dataScope: varchar('data_scope', { length: 24 })
      .default('ORGANIZATION')
      .notNull(),
    constraints: jsonb('constraints').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_agent_tool_policies_version_tool_uq').on(
      table.agentVersionId,
      table.toolDefinitionId,
    ),
    index('ai_agent_tool_policies_org_idx').on(table.organizationId),
  ],
);

export const aiToolExecutions = pgTable(
  'ai_tool_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    toolDefinitionId: uuid('tool_definition_id')
      .notNull()
      .references(() => aiToolDefinitions.id, { onDelete: 'restrict' }),
    callId: varchar('call_id', { length: 220 }),
    riskLevel: varchar('risk_level', { length: 16 }).notNull(),
    policyMode: varchar('policy_mode', { length: 24 }).notNull(),
    status: varchar('status', { length: 32 }).default('REQUESTED').notNull(),
    arguments: jsonb('arguments').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<unknown>(),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('ai_tool_executions_run_idx').on(table.runId, table.createdAt),
    index('ai_tool_executions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const aiApprovals = pgTable(
  'ai_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    toolExecutionId: uuid('tool_execution_id')
      .notNull()
      .references(() => aiToolExecutions.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    requestedByType: varchar('requested_by_type', { length: 24 })
      .default('AI_AGENT')
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
    index('ai_approvals_org_status_idx').on(
      table.organizationId,
      table.status,
      table.requestedAt,
    ),
  ],
);
export const aiUsageRecords = pgTable(
  'ai_usage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => aiRuns.id, {
      onDelete: 'set null',
    }),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    operation: varchar('operation', { length: 48 }).notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    totalTokens: integer('total_tokens').default(0).notNull(),
    units: numeric('units', { precision: 18, scale: 6 })
      .default('0')
      .notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', {
      precision: 14,
      scale: 6,
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index('ai_usage_records_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('ai_usage_records_model_idx').on(
      table.provider,
      table.model,
      table.operation,
    ),
  ],
);

export const aiKnowledgeBases = pgTable(
  'ai_knowledge_bases',
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
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    embeddingProvider: varchar('embedding_provider', { length: 32 })
      .default('OPENAI')
      .notNull(),
    embeddingModel: varchar('embedding_model', { length: 120 })
      .default('text-embedding-3-small')
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_knowledge_bases_org_workspace_key_uq').on(
      table.organizationId,
      table.workspaceId,
      table.key,
    ),
  ],
);

export const aiKnowledgeDocuments = pgTable(
  'ai_knowledge_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => aiKnowledgeBases.id, { onDelete: 'cascade' }),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    sourceUri: text('source_uri'),
    title: varchar('title', { length: 300 }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ai_knowledge_documents_base_hash_uq').on(
      table.knowledgeBaseId,
      table.contentHash,
    ),
    index('ai_knowledge_documents_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const aiKnowledgeChunks = pgTable(
  'ai_knowledge_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => aiKnowledgeBases.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => aiKnowledgeDocuments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: varchar('embedding_model', { length: 120 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('ai_knowledge_chunks_document_index_uq').on(
      table.documentId,
      table.chunkIndex,
    ),
    index('ai_knowledge_chunks_org_base_idx').on(
      table.organizationId,
      table.knowledgeBaseId,
    ),
  ],
);

export const aiEvaluations = pgTable(
  'ai_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    evaluator: varchar('evaluator', { length: 80 }).notNull(),
    score: numeric('score', { precision: 8, scale: 4 }),
    passed: boolean('passed'),
    label: varchar('label', { length: 120 }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index('ai_evaluations_org_run_idx').on(
      table.organizationId,
      table.runId,
    ),
  ],
);
