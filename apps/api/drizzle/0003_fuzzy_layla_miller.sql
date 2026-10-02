CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "ai_agent_tool_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"tool_definition_id" uuid NOT NULL,
	"mode" varchar(24) DEFAULT 'DISABLED' NOT NULL,
	"data_scope" varchar(24) DEFAULT 'ORGANIZATION' NOT NULL,
	"constraints" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"provider" varchar(32) DEFAULT 'OPENAI' NOT NULL,
	"model" varchar(120) NOT NULL,
	"instructions" text NOT NULL,
	"model_settings" jsonb,
	"knowledge_policy" jsonb,
	"guardrail_policy" jsonb,
	"approval_policy" jsonb,
	"prompt_hash" varchar(64) NOT NULL,
	"created_by_member_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(180) NOT NULL,
	"role" varchar(80) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"default_handling_mode" varchar(32) DEFAULT 'AI_ASSIST' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tool_execution_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"requested_by_type" varchar(24) DEFAULT 'AI_AGENT' NOT NULL,
	"decided_by_member_id" uuid,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"evaluator" varchar(80) NOT NULL,
	"score" numeric(8, 4),
	"passed" boolean,
	"label" varchar(120),
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"embedding_provider" varchar(32) DEFAULT 'OPENAI' NOT NULL,
	"embedding_model" varchar(120) DEFAULT 'text-embedding-3-small' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"embedding" vector(1536),
	"embedding_model" varchar(120),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_uri" text,
	"title" varchar(300) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"conversation_id" uuid,
	"contact_id" uuid,
	"status" varchar(32) DEFAULT 'RUNNING' NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model" varchar(120) NOT NULL,
	"openai_response_id" varchar(220),
	"trace_id" varchar(220),
	"input" jsonb,
	"output" jsonb,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(14, 6),
	"latency_ms" integer,
	"failure_code" varchar(100),
	"failure_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"provider_state" jsonb,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"risk_level" varchar(16) NOT NULL,
	"handler_key" varchar(160) NOT NULL,
	"input_schema" jsonb NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_definition_id" uuid NOT NULL,
	"call_id" varchar(220),
	"risk_level" varchar(16) NOT NULL,
	"policy_mode" varchar(24) NOT NULL,
	"status" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid,
	"provider" varchar(32) NOT NULL,
	"model" varchar(120) NOT NULL,
	"operation" varchar(48) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"units" numeric(18, 6) DEFAULT '0' NOT NULL,
	"estimated_cost_usd" numeric(14, 6),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_policies" ADD CONSTRAINT "ai_agent_tool_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_tool_policies" ADD CONSTRAINT "ai_agent_tool_policies_agent_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_tool_policies" ADD CONSTRAINT "ai_agent_tool_policies_tool_definition_id_ai_tool_definitions_id_fk" FOREIGN KEY ("tool_definition_id") REFERENCES "public"."ai_tool_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_approvals" ADD CONSTRAINT "ai_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_approvals" ADD CONSTRAINT "ai_approvals_tool_execution_id_ai_tool_executions_id_fk" FOREIGN KEY ("tool_execution_id") REFERENCES "public"."ai_tool_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_approvals" ADD CONSTRAINT "ai_approvals_decided_by_member_id_organization_members_id_fk" FOREIGN KEY ("decided_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_bases" ADD CONSTRAINT "ai_knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_bases" ADD CONSTRAINT "ai_knowledge_bases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_knowledge_base_id_ai_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."ai_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_document_id_ai_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ai_knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_documents" ADD CONSTRAINT "ai_knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_documents" ADD CONSTRAINT "ai_knowledge_documents_knowledge_base_id_ai_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."ai_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_conversation_id_communication_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."communication_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_tool_definition_id_ai_tool_definitions_id_fk" FOREIGN KEY ("tool_definition_id") REFERENCES "public"."ai_tool_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_tool_policies_version_tool_uq" ON "ai_agent_tool_policies" USING btree ("agent_version_id","tool_definition_id");--> statement-breakpoint
CREATE INDEX "ai_agent_tool_policies_org_idx" ON "ai_agent_tool_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_agent_version_uq" ON "ai_agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "ai_agent_versions_org_status_idx" ON "ai_agent_versions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agents_org_workspace_key_uq" ON "ai_agents" USING btree ("organization_id","workspace_id","key");--> statement-breakpoint
CREATE INDEX "ai_agents_org_status_idx" ON "ai_agents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ai_approvals_org_status_idx" ON "ai_approvals" USING btree ("organization_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "ai_evaluations_org_run_idx" ON "ai_evaluations" USING btree ("organization_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_bases_org_workspace_key_uq" ON "ai_knowledge_bases" USING btree ("organization_id","workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_chunks_document_index_uq" ON "ai_knowledge_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_org_base_idx" ON "ai_knowledge_chunks" USING btree ("organization_id","knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_documents_base_hash_uq" ON "ai_knowledge_documents" USING btree ("knowledge_base_id","content_hash");--> statement-breakpoint
CREATE INDEX "ai_knowledge_documents_org_status_idx" ON "ai_knowledge_documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ai_runs_org_started_idx" ON "ai_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_runs_session_idx" ON "ai_runs" USING btree ("session_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_runs_org_status_idx" ON "ai_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ai_sessions_org_agent_idx" ON "ai_sessions" USING btree ("organization_id","agent_id");--> statement-breakpoint
CREATE INDEX "ai_sessions_org_conversation_idx" ON "ai_sessions" USING btree ("organization_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_definitions_key_uq" ON "ai_tool_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ai_tool_executions_run_idx" ON "ai_tool_executions" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_executions_org_status_idx" ON "ai_tool_executions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ai_usage_records_org_created_idx" ON "ai_usage_records" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_records_model_idx" ON "ai_usage_records" USING btree ("provider","model","operation");