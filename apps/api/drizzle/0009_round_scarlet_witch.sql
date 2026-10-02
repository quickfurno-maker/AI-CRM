CREATE TABLE "attendance_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"manager_member_id" uuid,
	"name" varchar(180) NOT NULL,
	"code" varchar(64),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"department_id" uuid,
	"organization_member_id" uuid,
	"manager_member_id" uuid,
	"employee_code" varchar(64) NOT NULL,
	"display_name" varchar(180) NOT NULL,
	"email" varchar(320),
	"phone" varchar(40),
	"designation" varchar(160),
	"employment_type" varchar(32) DEFAULT 'FULL_TIME' NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"joining_date" date,
	"exit_date" date,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"record_id" uuid,
	"shift_id" uuid,
	"branch_id" uuid,
	"policy_id" uuid,
	"event_type" varchar(32) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" varchar(32) DEFAULT 'WEB' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy_meters" integer,
	"location_validation" varchar(32) DEFAULT 'NOT_REQUIRED' NOT NULL,
	"distance_meters" integer,
	"idempotency_key" varchar(160),
	"actor_type" varchar(32) DEFAULT 'USER' NOT NULL,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"holiday_date" date NOT NULL,
	"name" varchar(180) NOT NULL,
	"holiday_type" varchar(32) DEFAULT 'COMPANY' NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" varchar(64) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"requested_days" numeric(6, 2) NOT NULL,
	"reason" text,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"approver_member_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(180) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"location_validation_mode" varchar(24) DEFAULT 'NONE' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"radius_meters" integer,
	"allow_remote" boolean DEFAULT false NOT NULL,
	"late_grace_minutes" integer DEFAULT 0 NOT NULL,
	"early_exit_grace_minutes" integer DEFAULT 0 NOT NULL,
	"max_shift_hours" integer DEFAULT 16 NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid,
	"attendance_date" date NOT NULL,
	"status" varchar(32) DEFAULT 'PRESENT' NOT NULL,
	"first_check_in_at" timestamp with time zone,
	"last_check_out_at" timestamp with time zone,
	"work_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_exit_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"source" varchar(32) DEFAULT 'EVENTS' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(160) NOT NULL,
	"code" varchar(64) NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"grace_minutes" integer DEFAULT 0 NOT NULL,
	"expected_minutes" integer NOT NULL,
	"weekly_off_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_departments" ADD CONSTRAINT "attendance_departments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_departments" ADD CONSTRAINT "attendance_departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_departments" ADD CONSTRAINT "attendance_departments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_departments" ADD CONSTRAINT "attendance_departments_manager_member_id_organization_members_id_fk" FOREIGN KEY ("manager_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_department_id_attendance_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."attendance_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_manager_member_id_organization_members_id_fk" FOREIGN KEY ("manager_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_attendance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_record_id_attendance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_shift_id_attendance_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_policy_id_attendance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."attendance_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holidays" ADD CONSTRAINT "attendance_holidays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holidays" ADD CONSTRAINT "attendance_holidays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holidays" ADD CONSTRAINT "attendance_holidays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_requests" ADD CONSTRAINT "attendance_leave_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_requests" ADD CONSTRAINT "attendance_leave_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_requests" ADD CONSTRAINT "attendance_leave_requests_employee_id_attendance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_requests" ADD CONSTRAINT "attendance_leave_requests_approver_member_id_organization_members_id_fk" FOREIGN KEY ("approver_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_attendance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shift_id_attendance_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift_assignments" ADD CONSTRAINT "attendance_shift_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift_assignments" ADD CONSTRAINT "attendance_shift_assignments_employee_id_attendance_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift_assignments" ADD CONSTRAINT "attendance_shift_assignments_shift_id_attendance_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shifts" ADD CONSTRAINT "attendance_shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shifts" ADD CONSTRAINT "attendance_shifts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shifts" ADD CONSTRAINT "attendance_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_departments_org_code_uq" ON "attendance_departments" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "attendance_departments_org_workspace_idx" ON "attendance_departments" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "attendance_departments_org_branch_idx" ON "attendance_departments" USING btree ("organization_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employees_org_code_uq" ON "attendance_employees" USING btree ("organization_id","employee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employees_org_member_uq" ON "attendance_employees" USING btree ("organization_id","organization_member_id");--> statement-breakpoint
CREATE INDEX "attendance_employees_org_branch_status_idx" ON "attendance_employees" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "attendance_employees_org_department_idx" ON "attendance_employees" USING btree ("organization_id","department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_events_org_idempotency_uq" ON "attendance_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "attendance_events_org_employee_time_idx" ON "attendance_events" USING btree ("organization_id","employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_events_org_record_idx" ON "attendance_events" USING btree ("organization_id","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_holidays_scope_date_name_uq" ON "attendance_holidays" USING btree ("organization_id","workspace_id","branch_id","holiday_date","name");--> statement-breakpoint
CREATE INDEX "attendance_holidays_org_date_idx" ON "attendance_holidays" USING btree ("organization_id","holiday_date");--> statement-breakpoint
CREATE INDEX "attendance_leave_org_employee_dates_idx" ON "attendance_leave_requests" USING btree ("organization_id","employee_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "attendance_leave_org_status_idx" ON "attendance_leave_requests" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "attendance_policies_org_branch_idx" ON "attendance_policies" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_org_employee_date_uq" ON "attendance_records" USING btree ("organization_id","employee_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_records_org_date_status_idx" ON "attendance_records" USING btree ("organization_id","attendance_date","status");--> statement-breakpoint
CREATE INDEX "attendance_records_org_employee_date_idx" ON "attendance_records" USING btree ("organization_id","employee_id","attendance_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_shift_assignments_emp_from_uq" ON "attendance_shift_assignments" USING btree ("organization_id","employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "attendance_shift_assignments_emp_range_idx" ON "attendance_shift_assignments" USING btree ("organization_id","employee_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_shifts_org_code_uq" ON "attendance_shifts" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "attendance_shifts_org_branch_idx" ON "attendance_shifts" USING btree ("organization_id","branch_id");