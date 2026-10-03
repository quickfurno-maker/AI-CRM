import {
  boolean,
  date,
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

export const contacts = pgTable(
  'crm_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    firstName: varchar('first_name', { length: 120 }),
    lastName: varchar('last_name', { length: 120 }),
    displayName: varchar('display_name', { length: 240 }).notNull(),
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 40 }),
    source: varchar('source', { length: 100 }),
    lifecycleStage: varchar('lifecycle_stage', { length: 64 })
      .default('LEAD')
      .notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_contacts_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('crm_contacts_org_owner_idx').on(
      table.organizationId,
      table.ownerMemberId,
    ),
    index('crm_contacts_org_email_idx').on(
      table.organizationId,
      table.email,
    ),
    index('crm_contacts_org_phone_idx').on(
      table.organizationId,
      table.phone,
    ),
  ],
);

export const companies = pgTable(
  'crm_companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 240 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    website: text('website'),
    phone: varchar('phone', { length: 40 }),
    industry: varchar('industry', { length: 120 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_companies_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('crm_companies_org_owner_idx').on(
      table.organizationId,
      table.ownerMemberId,
    ),
    index('crm_companies_org_name_idx').on(
      table.organizationId,
      table.name,
    ),
  ],
);

export const contactCompanies = pgTable(
  'crm_contact_companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    relationship: varchar('relationship', { length: 100 }),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('crm_contact_companies_org_pair_uq').on(
      table.organizationId,
      table.contactId,
      table.companyId,
    ),
  ],
);

export const pipelines = pgTable(
  'crm_pipelines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectType: varchar('object_type', { length: 32 }).notNull(),
    key: varchar('key', { length: 100 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('crm_pipelines_org_workspace_key_uq').on(
      table.organizationId,
      table.workspaceId,
      table.key,
    ),
    index('crm_pipelines_org_type_idx').on(
      table.organizationId,
      table.objectType,
    ),
  ],
);

export const pipelineStages = pgTable(
  'crm_pipeline_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 100 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    position: integer('position').notNull(),
    stageType: varchar('stage_type', { length: 32 }).default('OPEN').notNull(),
    probability: integer('probability').default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('crm_pipeline_stages_pipeline_key_uq').on(
      table.pipelineId,
      table.key,
    ),
    uniqueIndex('crm_pipeline_stages_pipeline_position_uq').on(
      table.pipelineId,
      table.position,
    ),
    index('crm_pipeline_stages_org_idx').on(table.organizationId),
  ],
);

export const leads = pgTable(
  'crm_leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 240 }).notNull(),
    source: varchar('source', { length: 100 }),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    temperature: varchar('temperature', { length: 24 })
      .default('COLD')
      .notNull(),
    score: integer('score').default(0).notNull(),
    estimatedValue: numeric('estimated_value', {
      precision: 18,
      scale: 2,
    }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    expectedCloseDate: date('expected_close_date'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_leads_org_stage_idx').on(
      table.organizationId,
      table.stageId,
    ),
    index('crm_leads_org_owner_idx').on(
      table.organizationId,
      table.ownerMemberId,
    ),
    index('crm_leads_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);
export const deals = pgTable(
  'crm_deals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    leadId: uuid('lead_id').references(() => leads.id, {
      onDelete: 'set null',
    }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 240 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    probability: integer('probability').default(0).notNull(),
    expectedCloseDate: date('expected_close_date'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_deals_org_stage_idx').on(table.organizationId, table.stageId),
    index('crm_deals_org_owner_idx').on(table.organizationId, table.ownerMemberId),
    index('crm_deals_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);

export const tasks = pgTable(
  'crm_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 240 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    priority: varchar('priority', { length: 24 }).default('NORMAL').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_tasks_org_owner_status_idx').on(
      table.organizationId,
      table.ownerMemberId,
      table.status,
    ),
    index('crm_tasks_org_due_idx').on(table.organizationId, table.dueAt),
  ],
);

export const appointments = pgTable(
  'crm_appointments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: uuid('owner_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 240 }).notNull(),
    status: varchar('status', { length: 32 }).default('SCHEDULED').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: varchar('timezone', { length: 80 }).default('Asia/Kolkata').notNull(),
    location: text('location'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_appointments_org_start_idx').on(table.organizationId, table.startsAt),
    index('crm_appointments_org_owner_idx').on(
      table.organizationId,
      table.ownerMemberId,
    ),
  ],
);

export const activities = pgTable(
  'crm_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorMemberId: uuid('actor_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 48 }).notNull(),
    direction: varchar('direction', { length: 24 }),
    subject: varchar('subject', { length: 240 }),
    body: text('body'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index('crm_activities_org_occurred_idx').on(
      table.organizationId,
      table.occurredAt,
    ),
    index('crm_activities_contact_idx').on(table.organizationId, table.contactId),
    index('crm_activities_lead_idx').on(table.organizationId, table.leadId),
    index('crm_activities_deal_idx').on(table.organizationId, table.dealId),
  ],
);

export const notes = pgTable(
  'crm_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    authorMemberId: uuid('author_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    objectType: varchar('object_type', { length: 48 }).notNull(),
    objectId: uuid('object_id').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_notes_org_object_idx').on(
      table.organizationId,
      table.objectType,
      table.objectId,
    ),
  ],
);

export const tags = pgTable(
  'crm_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    color: varchar('color', { length: 32 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('crm_tags_org_name_uq').on(table.organizationId, table.name),
  ],
);

export const objectTags = pgTable(
  'crm_object_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    objectType: varchar('object_type', { length: 48 }).notNull(),
    objectId: uuid('object_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('crm_object_tags_org_object_tag_uq').on(
      table.organizationId,
      table.objectType,
      table.objectId,
      table.tagId,
    ),
  ],
);

export const customFieldDefinitions = pgTable(
  'crm_custom_field_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    objectType: varchar('object_type', { length: 48 }).notNull(),
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    dataType: varchar('data_type', { length: 40 }).notNull(),
    groupName: varchar('group_name', { length: 160 }),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    isRequired: boolean('is_required').default(false).notNull(),
    position: integer('position').default(0).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('crm_custom_fields_org_object_key_uq').on(
      table.organizationId,
      table.objectType,
      table.key,
    ),
  ],
);

export const customFieldValues = pgTable(
  'crm_custom_field_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
    objectType: varchar('object_type', { length: 48 }).notNull(),
    objectId: uuid('object_id').notNull(),
    value: jsonb('value').$type<unknown>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('crm_custom_field_values_object_field_uq').on(
      table.organizationId,
      table.objectType,
      table.objectId,
      table.fieldId,
    ),
  ],
);

export const savedLists = pgTable(
  'crm_saved_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    objectType: varchar('object_type', { length: 48 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    listType: varchar('list_type', { length: 24 }).default('DYNAMIC').notNull(),
    status: varchar('status', { length: 32 }).default('ACTIVE').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('crm_saved_lists_org_object_idx').on(
      table.organizationId,
      table.objectType,
    ),
  ],
);

export const savedListMembers = pgTable(
  'crm_saved_list_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => savedLists.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('crm_saved_list_members_list_object_uq').on(
      table.listId,
      table.objectId,
    ),
  ],
);
