CREATE TABLE "automation_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step_run_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text,
	"requested_by_type" varchar(32) DEFAULT 'AUTOMATION' NOT NULL,
	"decided_by_member_id" uuid,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"edge_key" varchar(120) NOT NULL,
	"source_node_key" varchar(100) NOT NULL,
	"target_node_key" varchar(100) NOT NULL,
	"branch_key" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_event_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"event_id" varchar(180) NOT NULL,
	"event_type" varchar(180) NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"node_key" varchar(100) NOT NULL,
	"node_type" varchar(32) NOT NULL,
	"name" varchar(180) NOT NULL,
	"config" jsonb NOT NULL,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'RUNNING' NOT NULL,
	"trigger_type" varchar(32) NOT NULL,
	"trigger_event_id" varchar(180),
	"trigger_event_type" varchar(180),
	"current_node_key" varchar(100),
	"context" jsonb NOT NULL,
	"wake_at" timestamp with time zone,
	"steps_executed" integer DEFAULT 0 NOT NULL,
	"correlation_id" varchar(100),
	"causation_id" varchar(100),
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"node_key" varchar(100) NOT NULL,
	"node_type" varchar(32) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'RUNNING' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"wake_at" timestamp with time zone,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"trigger_type" varchar(32) DEFAULT 'EVENT' NOT NULL,
	"trigger_config" jsonb NOT NULL,
	"start_node_key" varchar(100),
	"max_steps" integer DEFAULT 100 NOT NULL,
	"created_by_member_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_approvals" ADD CONSTRAINT "automation_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approvals" ADD CONSTRAINT "automation_approvals_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approvals" ADD CONSTRAINT "automation_approvals_step_run_id_automation_step_runs_id_fk" FOREIGN KEY ("step_run_id") REFERENCES "public"."automation_step_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approvals" ADD CONSTRAINT "automation_approvals_decided_by_member_id_organization_members_id_fk" FOREIGN KEY ("decided_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_edges" ADD CONSTRAINT "automation_edges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_edges" ADD CONSTRAINT "automation_edges_workflow_version_id_automation_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."automation_workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_event_receipts" ADD CONSTRAINT "automation_event_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_event_receipts" ADD CONSTRAINT "automation_event_receipts_workflow_version_id_automation_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."automation_workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_event_receipts" ADD CONSTRAINT "automation_event_receipts_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_nodes" ADD CONSTRAINT "automation_nodes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_nodes" ADD CONSTRAINT "automation_nodes_workflow_version_id_automation_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."automation_workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workflow_id_automation_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workflow_version_id_automation_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."automation_workflow_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_runs" ADD CONSTRAINT "automation_step_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_runs" ADD CONSTRAINT "automation_step_runs_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_runs" ADD CONSTRAINT "automation_step_runs_node_id_automation_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."automation_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflow_versions" ADD CONSTRAINT "automation_workflow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflow_versions" ADD CONSTRAINT "automation_workflow_versions_workflow_id_automation_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflow_versions" ADD CONSTRAINT "automation_workflow_versions_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_approvals_org_status_idx" ON "automation_approvals" USING btree ("organization_id","status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_edges_version_key_uq" ON "automation_edges" USING btree ("workflow_version_id","edge_key");--> statement-breakpoint
CREATE INDEX "automation_edges_version_source_idx" ON "automation_edges" USING btree ("workflow_version_id","source_node_key","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_event_receipts_version_event_uq" ON "automation_event_receipts" USING btree ("workflow_version_id","event_id");--> statement-breakpoint
CREATE INDEX "automation_event_receipts_org_event_idx" ON "automation_event_receipts" USING btree ("organization_id","event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_nodes_version_key_uq" ON "automation_nodes" USING btree ("workflow_version_id","node_key");--> statement-breakpoint
CREATE INDEX "automation_nodes_org_version_idx" ON "automation_nodes" USING btree ("organization_id","workflow_version_id");--> statement-breakpoint
CREATE INDEX "automation_runs_org_status_wake_idx" ON "automation_runs" USING btree ("organization_id","status","wake_at");--> statement-breakpoint
CREATE INDEX "automation_runs_workflow_created_idx" ON "automation_runs" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_step_runs_run_created_idx" ON "automation_step_runs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_step_runs_org_status_idx" ON "automation_step_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_workflow_versions_workflow_version_uq" ON "automation_workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "automation_workflow_versions_org_status_idx" ON "automation_workflow_versions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_workflows_org_workspace_key_uq" ON "automation_workflows" USING btree ("organization_id","workspace_id","key");--> statement-breakpoint
CREATE INDEX "automation_workflows_org_status_idx" ON "automation_workflows" USING btree ("organization_id","status");