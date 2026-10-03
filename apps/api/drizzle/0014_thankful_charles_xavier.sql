CREATE TABLE "crm_data_job_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"input" jsonb NOT NULL,
	"object_id" uuid,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_data_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_member_id" uuid NOT NULL,
	"direction" varchar(16) NOT NULL,
	"object_type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"duplicate_strategy" varchar(24) DEFAULT 'SKIP' NOT NULL,
	"mapping" jsonb,
	"columns" jsonb,
	"filter" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"succeeded_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_lead_scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"field" varchar(180) NOT NULL,
	"operator" varchar(40) NOT NULL,
	"comparison_value" jsonb,
	"points" integer NOT NULL,
	"decay_days" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"seat_class" varchar(32) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"branch_id" uuid,
	"staff_profile_id" uuid,
	"role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invited_by_member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_addon_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"addon_id" uuid NOT NULL,
	"billing_cycle" varchar(24) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"tax_rate_percent" numeric(8, 4) DEFAULT '0' NOT NULL,
	"status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"entitlement_key" varchar(180) NOT NULL,
	"entitlement_mode" varchar(24) DEFAULT 'LIMIT_INCREMENT' NOT NULL,
	"units_per_quantity" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_member_id" uuid NOT NULL,
	"checkout_type" varchar(32) NOT NULL,
	"plan_price_id" uuid,
	"addon_price_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"coupon_id" uuid,
	"currency" varchar(3) NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"provider" varchar(40),
	"provider_session_id" varchar(240),
	"provider_payment_id" varchar(240),
	"idempotency_key" varchar(180) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"checkout_session_id" uuid,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(180) NOT NULL,
	"discount_type" varchar(24) NOT NULL,
	"discount_value" numeric(18, 2) NOT NULL,
	"currency" varchar(3),
	"duration" varchar(24) DEFAULT 'ONCE' NOT NULL,
	"max_redemptions" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_customer_billing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"billing_email" varchar(320) NOT NULL,
	"billing_phone" varchar(40),
	"tax_id" varchar(120),
	"address_line_1" varchar(240),
	"address_line_2" varchar(240),
	"city" varchar(120),
	"state" varchar(120),
	"postal_code" varchar(32),
	"country" varchar(2) DEFAULT 'IN' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saas_customer_billing_profiles_org_uq" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "saas_dunning_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dunning_case_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(32) NOT NULL,
	"provider_attempt_id" varchar(240),
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_dunning_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"recovered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_type" varchar(32) NOT NULL,
	"reference_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit_amount" numeric(18, 2) NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"invoice_number" varchar(80) NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(18, 2) NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"checkout_session_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_meter_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"meter_key" varchar(160) NOT NULL,
	"unit" varchar(40) DEFAULT 'unit' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"included_quantity" numeric(20, 6) DEFAULT '0' NOT NULL,
	"unit_amount" numeric(18, 6) DEFAULT '0' NOT NULL,
	"warning_threshold_percent" integer DEFAULT 80 NOT NULL,
	"enforcement_mode" varchar(24) DEFAULT 'OVERAGE' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_cycle" varchar(24) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"tax_rate_percent" numeric(8, 4) DEFAULT '0' NOT NULL,
	"status" varchar(24) DEFAULT 'DRAFT' NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_number" varchar(80) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"provider" varchar(40),
	"provider_payment_id" varchar(240),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_subscription_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"pending_quantity" integer,
	"pending_change_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"meter_key" varchar(160) NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit" varchar(40) DEFAULT 'unit' NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"source_id" varchar(180),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" varchar(240) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "currency" varchar(3) DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_subscription_id" varchar(180);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_billing_cycle" varchar(16);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_custom_field_definitions" ADD COLUMN "group_name" varchar(160);--> statement-breakpoint
ALTER TABLE "crm_custom_field_definitions" ADD COLUMN "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_saved_lists" ADD COLUMN "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_data_job_rows" ADD CONSTRAINT "crm_data_job_rows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_data_job_rows" ADD CONSTRAINT "crm_data_job_rows_job_id_crm_data_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_data_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_data_jobs" ADD CONSTRAINT "crm_data_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_data_jobs" ADD CONSTRAINT "crm_data_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_data_jobs" ADD CONSTRAINT "crm_data_jobs_requested_by_member_id_organization_members_id_fk" FOREIGN KEY ("requested_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_scoring_rules" ADD CONSTRAINT "crm_lead_scoring_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_scoring_rules" ADD CONSTRAINT "crm_lead_scoring_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_member_id_organization_members_id_fk" FOREIGN KEY ("invited_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_addon_prices" ADD CONSTRAINT "saas_addon_prices_addon_id_saas_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."saas_addons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_checkout_sessions" ADD CONSTRAINT "saas_checkout_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_checkout_sessions" ADD CONSTRAINT "saas_checkout_sessions_requested_by_member_id_organization_members_id_fk" FOREIGN KEY ("requested_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_checkout_sessions" ADD CONSTRAINT "saas_checkout_sessions_plan_price_id_saas_plan_prices_id_fk" FOREIGN KEY ("plan_price_id") REFERENCES "public"."saas_plan_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_checkout_sessions" ADD CONSTRAINT "saas_checkout_sessions_addon_price_id_saas_addon_prices_id_fk" FOREIGN KEY ("addon_price_id") REFERENCES "public"."saas_addon_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_checkout_sessions" ADD CONSTRAINT "saas_checkout_sessions_coupon_id_saas_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."saas_coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_coupon_redemptions" ADD CONSTRAINT "saas_coupon_redemptions_coupon_id_saas_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."saas_coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_coupon_redemptions" ADD CONSTRAINT "saas_coupon_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_customer_billing_profiles" ADD CONSTRAINT "saas_customer_billing_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_dunning_attempts" ADD CONSTRAINT "saas_dunning_attempts_dunning_case_id_saas_dunning_cases_id_fk" FOREIGN KEY ("dunning_case_id") REFERENCES "public"."saas_dunning_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_dunning_cases" ADD CONSTRAINT "saas_dunning_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_dunning_cases" ADD CONSTRAINT "saas_dunning_cases_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_dunning_cases" ADD CONSTRAINT "saas_dunning_cases_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoice_lines" ADD CONSTRAINT "saas_invoice_lines_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_checkout_session_id_saas_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."saas_checkout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_meter_prices" ADD CONSTRAINT "saas_meter_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_plan_prices" ADD CONSTRAINT "saas_plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_receipts" ADD CONSTRAINT "saas_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_receipts" ADD CONSTRAINT "saas_receipts_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_addons" ADD CONSTRAINT "saas_subscription_addons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_addons" ADD CONSTRAINT "saas_subscription_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_addons" ADD CONSTRAINT "saas_subscription_addons_addon_id_saas_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."saas_addons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD CONSTRAINT "saas_subscription_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD CONSTRAINT "saas_subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD CONSTRAINT "saas_subscription_events_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_usage_ledger" ADD CONSTRAINT "saas_usage_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_data_job_rows_job_row_uq" ON "crm_data_job_rows" USING btree ("job_id","row_number");--> statement-breakpoint
CREATE INDEX "crm_data_job_rows_job_status_idx" ON "crm_data_job_rows" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "crm_data_jobs_org_created_idx" ON "crm_data_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_data_jobs_status_created_idx" ON "crm_data_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "crm_lead_scoring_rules_org_workspace_idx" ON "crm_lead_scoring_rules" USING btree ("organization_id","workspace_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_scoring_rules_org_workspace_name_uq" ON "crm_lead_scoring_rules" USING btree ("organization_id","workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_token_uq" ON "organization_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_invitations_org_email_idx" ON "organization_invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "organization_invitations_org_status_idx" ON "organization_invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_addon_prices_addon_cycle_currency_uq" ON "saas_addon_prices" USING btree ("addon_id","billing_cycle","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_addons_key_uq" ON "saas_addons" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_checkout_sessions_org_idempotency_uq" ON "saas_checkout_sessions" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "saas_checkout_sessions_org_status_idx" ON "saas_checkout_sessions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_coupon_redemptions_coupon_org_checkout_uq" ON "saas_coupon_redemptions" USING btree ("coupon_id","organization_id","checkout_session_id");--> statement-breakpoint
CREATE INDEX "saas_coupon_redemptions_coupon_idx" ON "saas_coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_coupons_code_uq" ON "saas_coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_dunning_attempts_case_number_uq" ON "saas_dunning_attempts" USING btree ("dunning_case_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_dunning_cases_invoice_uq" ON "saas_dunning_cases" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "saas_dunning_cases_status_next_idx" ON "saas_dunning_cases" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "saas_invoice_lines_invoice_idx" ON "saas_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_invoices_number_uq" ON "saas_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "saas_invoices_org_status_due_idx" ON "saas_invoices" USING btree ("organization_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_meter_prices_plan_meter_currency_uq" ON "saas_meter_prices" USING btree ("plan_id","meter_key","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_plan_prices_plan_cycle_currency_uq" ON "saas_plan_prices" USING btree ("plan_id","billing_cycle","currency");--> statement-breakpoint
CREATE INDEX "saas_plan_prices_status_idx" ON "saas_plan_prices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_receipts_number_uq" ON "saas_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_receipts_provider_payment_uq" ON "saas_receipts" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_subscription_addons_subscription_addon_uq" ON "saas_subscription_addons" USING btree ("subscription_id","addon_id");--> statement-breakpoint
CREATE INDEX "saas_subscription_addons_org_status_idx" ON "saas_subscription_addons" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "saas_subscription_events_subscription_created_idx" ON "saas_subscription_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_usage_ledger_org_idempotency_uq" ON "saas_usage_ledger" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "saas_usage_ledger_org_meter_occurred_idx" ON "saas_usage_ledger" USING btree ("organization_id","meter_key","occurred_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;