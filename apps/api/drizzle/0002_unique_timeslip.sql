CREATE TABLE "communication_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"destination" varchar(80) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"message_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"name" varchar(220) NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"audience_filters" jsonb,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_channel_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"meta_business_connection_id" uuid,
	"provider" varchar(32) NOT NULL,
	"channel_type" varchar(32) NOT NULL,
	"provider_account_id" varchar(180),
	"provider_phone_number_id" varchar(180),
	"display_name" varchar(160),
	"display_address" varchar(120),
	"credential_ref" varchar(500),
	"status" varchar(32) DEFAULT 'DISCONNECTED' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_type" varchar(32) NOT NULL,
	"purpose" varchar(48) NOT NULL,
	"status" varchar(32) NOT NULL,
	"source" varchar(100) NOT NULL,
	"proof" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"participant_type" varchar(32) NOT NULL,
	"participant_id" varchar(180) NOT NULL,
	"display_name" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"assigned_member_id" uuid,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"handling_mode" varchar(32) DEFAULT 'HUMAN' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"media_type" varchar(40) NOT NULL,
	"provider_media_id" varchar(220),
	"mime_type" varchar(160),
	"file_name" varchar(300),
	"storage_key" varchar(700),
	"caption" text,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_message_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" varchar(40) NOT NULL,
	"provider_timestamp" timestamp with time zone,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"meta_business_connection_id" uuid NOT NULL,
	"channel_account_id" uuid,
	"provider_template_id" varchar(220),
	"name" varchar(512) NOT NULL,
	"language" varchar(32) NOT NULL,
	"category" varchar(48),
	"status" varchar(48) DEFAULT 'LOCAL_DRAFT' NOT NULL,
	"quality" varchar(48),
	"components" jsonb NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"external_message_id" varchar(220),
	"idempotency_key" varchar(180),
	"direction" varchar(16) NOT NULL,
	"message_type" varchar(40) NOT NULL,
	"text_body" text,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"provider_status" varchar(64),
	"reply_to_external_message_id" varchar(220),
	"provider_timestamp" timestamp with time zone,
	"sent_by_member_id" uuid,
	"metadata" jsonb,
	"failure_code" varchar(100),
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_meta_business_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"onboarding_mode" varchar(32) DEFAULT 'EMBEDDED_SIGNUP' NOT NULL,
	"connection_status" varchar(48) DEFAULT 'PENDING' NOT NULL,
	"client_asset_ownership" varchar(24) DEFAULT 'CLIENT' NOT NULL,
	"partner_role" varchar(32) DEFAULT 'TECH_PROVIDER' NOT NULL,
	"billing_mode" varchar(48) DEFAULT 'CLIENT_DIRECT' NOT NULL,
	"meta_business_portfolio_id" varchar(180),
	"waba_id" varchar(180),
	"assigned_system_user_id" varchar(180),
	"credential_ref" varchar(500),
	"embedded_signup_state" varchar(180),
	"app_subscribed_at" timestamp with time zone,
	"access_granted_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"channel_account_id" uuid,
	"provider" varchar(32) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"signature" varchar(180),
	"payload" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_campaign_recipients" ADD CONSTRAINT "communication_campaign_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaign_recipients" ADD CONSTRAINT "communication_campaign_recipients_campaign_id_communication_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."communication_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaign_recipients" ADD CONSTRAINT "communication_campaign_recipients_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaign_recipients" ADD CONSTRAINT "communication_campaign_recipients_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_template_id_communication_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_message_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channel_accounts" ADD CONSTRAINT "communication_channel_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channel_accounts" ADD CONSTRAINT "communication_channel_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channel_accounts" ADD CONSTRAINT "communication_channel_accounts_meta_business_connection_id_communication_meta_business_connections_id_fk" FOREIGN KEY ("meta_business_connection_id") REFERENCES "public"."communication_meta_business_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_consents" ADD CONSTRAINT "communication_consents_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversation_participants" ADD CONSTRAINT "communication_conversation_participants_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_conversations" ADD CONSTRAINT "communication_conversations_assigned_member_id_organization_members_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_attachments" ADD CONSTRAINT "communication_message_attachments_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_status_events" ADD CONSTRAINT "communication_message_status_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_status_events" ADD CONSTRAINT "communication_message_status_events_message_id_communication_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."communication_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_templates" ADD CONSTRAINT "communication_message_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_templates" ADD CONSTRAINT "communication_message_templates_meta_business_connection_id_communication_meta_business_connections_id_fk" FOREIGN KEY ("meta_business_connection_id") REFERENCES "public"."communication_meta_business_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_message_templates" ADD CONSTRAINT "communication_message_templates_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_sent_by_member_id_organization_members_id_fk" FOREIGN KEY ("sent_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_meta_business_connections" ADD CONSTRAINT "communication_meta_business_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_meta_business_connections" ADD CONSTRAINT "communication_meta_business_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_webhook_events" ADD CONSTRAINT "communication_webhook_events_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_campaign_contact_uq" ON "communication_campaign_recipients" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_status_idx" ON "communication_campaign_recipients" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_org_status_schedule_idx" ON "communication_campaigns" USING btree ("organization_id","status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_accounts_provider_phone_uq" ON "communication_channel_accounts" USING btree ("provider","provider_phone_number_id");--> statement-breakpoint
CREATE INDEX "channel_accounts_org_idx" ON "communication_channel_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_consents_contact_purpose_uq" ON "communication_consents" USING btree ("organization_id","contact_id","channel_type","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_uq" ON "communication_conversation_participants" USING btree ("conversation_id","participant_type","participant_id");--> statement-breakpoint
CREATE INDEX "conversations_org_last_message_idx" ON "communication_conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_org_assignee_idx" ON "communication_conversations" USING btree ("organization_id","assigned_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_contact_uq" ON "communication_conversations" USING btree ("channel_account_id","contact_id");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "communication_message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_status_events_message_idx" ON "communication_message_status_events" USING btree ("message_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_connection_name_language_uq" ON "communication_message_templates" USING btree ("meta_business_connection_id","name","language");--> statement-breakpoint
CREATE INDEX "message_templates_org_status_idx" ON "communication_message_templates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_external_uq" ON "communication_messages" USING btree ("channel_account_id","external_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_org_idempotency_uq" ON "communication_messages" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "communication_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_org_status_idx" ON "communication_messages" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_business_connections_waba_uq" ON "communication_meta_business_connections" USING btree ("waba_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_business_connections_signup_state_uq" ON "communication_meta_business_connections" USING btree ("embedded_signup_state");--> statement-breakpoint
CREATE INDEX "meta_business_connections_status_idx" ON "communication_meta_business_connections" USING btree ("connection_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_payload_hash_uq" ON "communication_webhook_events" USING btree ("provider","payload_hash");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "communication_webhook_events" USING btree ("status","created_at");