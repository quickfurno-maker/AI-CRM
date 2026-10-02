CREATE TABLE "ai_whatsapp_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"operator_member_id" uuid,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_handling_mode" varchar(32) DEFAULT 'AI_ASSIST' NOT NULL,
	"max_context_messages" integer DEFAULT 20 NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_whatsapp_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"binding_id" uuid,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"run_id" uuid,
	"outbound_message_id" uuid,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_whatsapp_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" varchar(32) DEFAULT 'REPLY' NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"sent_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_whatsapp_bindings" ADD CONSTRAINT "ai_whatsapp_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_bindings" ADD CONSTRAINT "ai_whatsapp_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_bindings" ADD CONSTRAINT "ai_whatsapp_bindings_channel_account_id_communication_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."communication_channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_bindings" ADD CONSTRAINT "ai_whatsapp_bindings_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_bindings" ADD CONSTRAINT "ai_whatsapp_bindings_operator_member_id_organization_members_id_fk" FOREIGN KEY ("operator_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_binding_id_ai_whatsapp_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."ai_whatsapp_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_inbound_message_id_communication_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."communication_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_jobs" ADD CONSTRAINT "ai_whatsapp_jobs_outbound_message_id_communication_messages_id_fk" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."communication_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_job_id_ai_whatsapp_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_whatsapp_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_inbound_message_id_communication_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."communication_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_whatsapp_suggestions" ADD CONSTRAINT "ai_whatsapp_suggestions_sent_message_id_communication_messages_id_fk" FOREIGN KEY ("sent_message_id") REFERENCES "public"."communication_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_whatsapp_bindings_channel_uq" ON "ai_whatsapp_bindings" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "ai_whatsapp_bindings_org_enabled_idx" ON "ai_whatsapp_bindings" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_whatsapp_jobs_inbound_message_uq" ON "ai_whatsapp_jobs" USING btree ("inbound_message_id");--> statement-breakpoint
CREATE INDEX "ai_whatsapp_jobs_org_status_idx" ON "ai_whatsapp_jobs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_whatsapp_suggestions_job_type_uq" ON "ai_whatsapp_suggestions" USING btree ("job_id","type");--> statement-breakpoint
CREATE INDEX "ai_whatsapp_suggestions_org_status_idx" ON "ai_whatsapp_suggestions" USING btree ("organization_id","status","created_at");