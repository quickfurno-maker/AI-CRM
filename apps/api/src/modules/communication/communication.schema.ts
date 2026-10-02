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
import { contacts } from '../crm/crm.schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const metaBusinessConnections = pgTable(
  'communication_meta_business_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    onboardingMode: varchar('onboarding_mode', { length: 32 })
      .default('EMBEDDED_SIGNUP')
      .notNull(),
    connectionStatus: varchar('connection_status', { length: 48 })
      .default('PENDING')
      .notNull(),
    clientAssetOwnership: varchar('client_asset_ownership', { length: 24 })
      .default('CLIENT')
      .notNull(),
    partnerRole: varchar('partner_role', { length: 32 })
      .default('TECH_PROVIDER')
      .notNull(),
    billingMode: varchar('billing_mode', { length: 48 })
      .default('CLIENT_DIRECT')
      .notNull(),
    metaBusinessPortfolioId: varchar('meta_business_portfolio_id', {
      length: 180,
    }),
    wabaId: varchar('waba_id', { length: 180 }),
    assignedSystemUserId: varchar('assigned_system_user_id', { length: 180 }),
    credentialRef: varchar('credential_ref', { length: 500 }),
    embeddedSignupState: varchar('embedded_signup_state', { length: 180 }),
    appSubscribedAt: timestamp('app_subscribed_at', { withTimezone: true }),
    accessGrantedAt: timestamp('access_granted_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('meta_business_connections_waba_uq').on(table.wabaId),
    uniqueIndex('meta_business_connections_signup_state_uq').on(
      table.embeddedSignupState,
    ),
    index('meta_business_connections_status_idx').on(
      table.connectionStatus,
      table.updatedAt,
    ),
  ],
);

export const channelAccounts = pgTable(
  'communication_channel_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    metaBusinessConnectionId: uuid('meta_business_connection_id').references(
      () => metaBusinessConnections.id,
      { onDelete: 'set null' },
    ),
    provider: varchar('provider', { length: 32 }).notNull(),
    channelType: varchar('channel_type', { length: 32 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 180 }),
    providerPhoneNumberId: varchar('provider_phone_number_id', {
      length: 180,
    }),
    displayName: varchar('display_name', { length: 160 }),
    displayAddress: varchar('display_address', { length: 120 }),
    credentialRef: varchar('credential_ref', { length: 500 }),
    status: varchar('status', { length: 32 }).default('DISCONNECTED').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('channel_accounts_provider_phone_uq').on(
      table.provider,
      table.providerPhoneNumberId,
    ),
    index('channel_accounts_org_idx').on(table.organizationId),
  ],
);

export const conversations = pgTable(
  'communication_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id')
      .notNull()
      .references(() => channelAccounts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    assignedMemberId: uuid('assigned_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    status: varchar('status', { length: 32 }).default('OPEN').notNull(),
    handlingMode: varchar('handling_mode', { length: 32 })
      .default('HUMAN')
      .notNull(),
    handlingModeSource: varchar('handling_mode_source', { length: 32 })
      .default('DEFAULT')
      .notNull(),
    handlingModeUpdatedAt: timestamp('handling_mode_updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    unreadCount: integer('unread_count').default(0).notNull(),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('conversations_org_last_message_idx').on(
      table.organizationId,
      table.lastMessageAt,
    ),
    index('conversations_org_assignee_idx').on(
      table.organizationId,
      table.assignedMemberId,
    ),
    uniqueIndex('conversations_channel_contact_uq').on(
      table.channelAccountId,
      table.contactId,
    ),
  ],
);

export const conversationParticipants = pgTable(
  'communication_conversation_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    participantType: varchar('participant_type', { length: 32 }).notNull(),
    participantId: varchar('participant_id', { length: 180 }).notNull(),
    displayName: varchar('display_name', { length: 160 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('conversation_participants_uq').on(
      table.conversationId,
      table.participantType,
      table.participantId,
    ),
  ],
);

export const messages = pgTable(
  'communication_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id')
      .notNull()
      .references(() => channelAccounts.id, { onDelete: 'cascade' }),
    externalMessageId: varchar('external_message_id', { length: 220 }),
    idempotencyKey: varchar('idempotency_key', { length: 180 }),
    direction: varchar('direction', { length: 16 }).notNull(),
    messageType: varchar('message_type', { length: 40 }).notNull(),
    textBody: text('text_body'),
    status: varchar('status', { length: 32 }).default('QUEUED').notNull(),
    providerStatus: varchar('provider_status', { length: 64 }),
    replyToExternalMessageId: varchar('reply_to_external_message_id', {
      length: 220,
    }),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }),
    sentByMemberId: uuid('sent_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: text('failure_message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('messages_channel_external_uq').on(
      table.channelAccountId,
      table.externalMessageId,
    ),
    uniqueIndex('messages_org_idempotency_uq').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    index('messages_org_status_idx').on(table.organizationId, table.status),
  ],
);

export const messageAttachments = pgTable(
  'communication_message_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mediaType: varchar('media_type', { length: 40 }).notNull(),
    providerMediaId: varchar('provider_media_id', { length: 220 }),
    mimeType: varchar('mime_type', { length: 160 }),
    fileName: varchar('file_name', { length: 300 }),
    storageKey: varchar('storage_key', { length: 700 }),
    caption: text('caption'),
    sizeBytes: integer('size_bytes'),
    createdAt: createdAt(),
  },
  (table) => [index('message_attachments_message_idx').on(table.messageId)],
);

export const messageStatusEvents = pgTable(
  'communication_message_status_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 40 }).notNull(),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index('message_status_events_message_idx').on(
      table.messageId,
      table.createdAt,
    ),
  ],
);

export const communicationConsents = pgTable(
  'communication_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channelType: varchar('channel_type', { length: 32 }).notNull(),
    purpose: varchar('purpose', { length: 48 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    source: varchar('source', { length: 100 }).notNull(),
    proof: jsonb('proof').$type<Record<string, unknown>>(),
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('communication_consents_contact_purpose_uq').on(
      table.organizationId,
      table.contactId,
      table.channelType,
      table.purpose,
    ),
  ],
);

export const messageTemplates = pgTable(
  'communication_message_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    metaBusinessConnectionId: uuid('meta_business_connection_id')
      .notNull()
      .references(() => metaBusinessConnections.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').references(
      () => channelAccounts.id,
      { onDelete: 'set null' },
    ),
    providerTemplateId: varchar('provider_template_id', { length: 220 }),
    name: varchar('name', { length: 512 }).notNull(),
    language: varchar('language', { length: 32 }).notNull(),
    category: varchar('category', { length: 48 }),
    status: varchar('status', { length: 48 }).default('LOCAL_DRAFT').notNull(),
    quality: varchar('quality', { length: 48 }),
    components: jsonb('components').$type<unknown[]>().notNull(),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('message_templates_connection_name_language_uq').on(
      table.metaBusinessConnectionId,
      table.name,
      table.language,
    ),
    index('message_templates_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const campaigns = pgTable(
  'communication_campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id')
      .notNull()
      .references(() => channelAccounts.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => messageTemplates.id, { onDelete: 'restrict' }),
    createdByMemberId: uuid('created_by_member_id').references(
      () => organizationMembers.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 220 }).notNull(),
    status: varchar('status', { length: 32 }).default('DRAFT').notNull(),
    audienceFilters: jsonb('audience_filters').$type<Record<string, unknown>>(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('campaigns_org_status_schedule_idx').on(
      table.organizationId,
      table.status,
      table.scheduledAt,
    ),
  ],
);

export const campaignRecipients = pgTable(
  'communication_campaign_recipients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    destination: varchar('destination', { length: 80 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    processingStartedAt: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('campaign_recipients_campaign_contact_uq').on(
      table.campaignId,
      table.contactId,
    ),
    index('campaign_recipients_status_idx').on(
      table.campaignId,
      table.status,
    ),
  ],
);

export const webhookEvents = pgTable(
  'communication_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    channelAccountId: uuid('channel_account_id').references(
      () => channelAccounts.id,
      { onDelete: 'set null' },
    ),
    provider: varchar('provider', { length: 32 }).notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    signature: varchar('signature', { length: 180 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_payload_hash_uq').on(
      table.provider,
      table.payloadHash,
    ),
    index('webhook_events_status_idx').on(table.status, table.createdAt),
  ],
);
