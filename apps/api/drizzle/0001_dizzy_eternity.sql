CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"lead_id" uuid,
	"deal_id" uuid,
	"type" varchar(48) NOT NULL,
	"direction" varchar(24),
	"subject" varchar(240),
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"deal_id" uuid,
	"title" varchar(240) NOT NULL,
	"status" varchar(32) DEFAULT 'SCHEDULED' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"name" varchar(240) NOT NULL,
	"domain" varchar(255),
	"website" text,
	"phone" varchar(40),
	"industry" varchar(120),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"relationship" varchar(100),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"display_name" varchar(240) NOT NULL,
	"email" varchar(320),
	"phone" varchar(40),
	"source" varchar(100),
	"lifecycle_stage" varchar(64) DEFAULT 'LEAD' NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"object_type" varchar(48) NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(160) NOT NULL,
	"data_type" varchar(40) NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"object_type" varchar(48) NOT NULL,
	"object_id" uuid NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"lead_id" uuid,
	"owner_member_id" uuid,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" varchar(240) NOT NULL,
	"amount" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"expected_close_date" date,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"owner_member_id" uuid,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"source" varchar(100),
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"temperature" varchar(24) DEFAULT 'COLD' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"estimated_value" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"expected_close_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_member_id" uuid,
	"object_type" varchar(48) NOT NULL,
	"object_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_object_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"object_type" varchar(48) NOT NULL,
	"object_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(160) NOT NULL,
	"position" integer NOT NULL,
	"stage_type" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_type" varchar(32) NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(160) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_saved_list_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_saved_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"object_type" varchar(48) NOT NULL,
	"name" varchar(160) NOT NULL,
	"list_type" varchar(24) DEFAULT 'DYNAMIC' NOT NULL,
	"filters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"deal_id" uuid,
	"title" varchar(240) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"priority" varchar(24) DEFAULT 'NORMAL' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_actor_member_id_organization_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_companies" ADD CONSTRAINT "crm_contact_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_companies" ADD CONSTRAINT "crm_contact_companies_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_companies" ADD CONSTRAINT "crm_contact_companies_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_definitions" ADD CONSTRAINT "crm_custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_field_id_crm_custom_field_definitions_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."crm_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_author_member_id_organization_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_object_tags" ADD CONSTRAINT "crm_object_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_object_tags" ADD CONSTRAINT "crm_object_tags_tag_id_crm_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."crm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_list_members" ADD CONSTRAINT "crm_saved_list_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_list_members" ADD CONSTRAINT "crm_saved_list_members_list_id_crm_saved_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."crm_saved_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_lists" ADD CONSTRAINT "crm_saved_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_lists" ADD CONSTRAINT "crm_saved_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_lists" ADD CONSTRAINT "crm_saved_lists_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tags" ADD CONSTRAINT "crm_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activities_org_occurred_idx" ON "crm_activities" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_contact_idx" ON "crm_activities" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "crm_activities_lead_idx" ON "crm_activities" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE INDEX "crm_activities_deal_idx" ON "crm_activities" USING btree ("organization_id","deal_id");--> statement-breakpoint
CREATE INDEX "crm_appointments_org_start_idx" ON "crm_appointments" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "crm_appointments_org_owner_idx" ON "crm_appointments" USING btree ("organization_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "crm_companies_org_created_idx" ON "crm_companies" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_companies_org_owner_idx" ON "crm_companies" USING btree ("organization_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "crm_companies_org_name_idx" ON "crm_companies" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contact_companies_org_pair_uq" ON "crm_contact_companies" USING btree ("organization_id","contact_id","company_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_org_created_idx" ON "crm_contacts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_contacts_org_owner_idx" ON "crm_contacts" USING btree ("organization_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_org_email_idx" ON "crm_contacts" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "crm_contacts_org_phone_idx" ON "crm_contacts" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_custom_fields_org_object_key_uq" ON "crm_custom_field_definitions" USING btree ("organization_id","object_type","key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_custom_field_values_object_field_uq" ON "crm_custom_field_values" USING btree ("organization_id","object_type","object_id","field_id");--> statement-breakpoint
CREATE INDEX "crm_deals_org_stage_idx" ON "crm_deals" USING btree ("organization_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_org_owner_idx" ON "crm_deals" USING btree ("organization_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "crm_deals_org_created_idx" ON "crm_deals" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_leads_org_stage_idx" ON "crm_leads" USING btree ("organization_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_leads_org_owner_idx" ON "crm_leads" USING btree ("organization_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "crm_leads_org_created_idx" ON "crm_leads" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_notes_org_object_idx" ON "crm_notes" USING btree ("organization_id","object_type","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_object_tags_org_object_tag_uq" ON "crm_object_tags" USING btree ("organization_id","object_type","object_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_pipeline_key_uq" ON "crm_pipeline_stages" USING btree ("pipeline_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_pipeline_position_uq" ON "crm_pipeline_stages" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE INDEX "crm_pipeline_stages_org_idx" ON "crm_pipeline_stages" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_org_workspace_key_uq" ON "crm_pipelines" USING btree ("organization_id","workspace_id","key");--> statement-breakpoint
CREATE INDEX "crm_pipelines_org_type_idx" ON "crm_pipelines" USING btree ("organization_id","object_type");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_saved_list_members_list_object_uq" ON "crm_saved_list_members" USING btree ("list_id","object_id");--> statement-breakpoint
CREATE INDEX "crm_saved_lists_org_object_idx" ON "crm_saved_lists" USING btree ("organization_id","object_type");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_tags_org_name_uq" ON "crm_tags" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "crm_tasks_org_owner_status_idx" ON "crm_tasks" USING btree ("organization_id","owner_member_id","status");--> statement-breakpoint
CREATE INDEX "crm_tasks_org_due_idx" ON "crm_tasks" USING btree ("organization_id","due_at");