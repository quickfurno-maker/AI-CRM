CREATE TABLE "business_billing_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"tax_id" varchar(120),
	"billing_email" varchar(320),
	"billing_phone" varchar(40),
	"address_line_1" varchar(240),
	"address_line_2" varchar(240),
	"city" varchar(120),
	"state" varchar(120),
	"postal_code" varchar(32),
	"country" varchar(2) DEFAULT 'IN' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"quote_prefix" varchar(24) DEFAULT 'Q' NOT NULL,
	"invoice_prefix" varchar(24) DEFAULT 'INV' NOT NULL,
	"credit_note_prefix" varchar(24) DEFAULT 'CN' NOT NULL,
	"receipt_prefix" varchar(24) DEFAULT 'RCT' NOT NULL,
	"default_payment_terms_days" integer DEFAULT 15 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"credit_note_number" varchar(80) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(32) DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_type" varchar(32) NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_rate_percent" numeric(8, 4) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quote_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"deal_id" uuid,
	"owner_member_id" uuid,
	"invoice_number" varchar(80),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"customer_snapshot" jsonb,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credited_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(18, 2) DEFAULT '0' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"notes" text,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_number" varchar(80) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"method" varchar(40) NOT NULL,
	"reference" varchar(180),
	"status" varchar(32) DEFAULT 'POSTED' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_rate_percent" numeric(8, 4) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid,
	"company_id" uuid,
	"deal_id" uuid,
	"owner_member_id" uuid,
	"quote_number" varchar(80),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"customer_snapshot" jsonb,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valid_until" date,
	"notes" text,
	"issued_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"rate_percent" numeric(8, 4) NOT NULL,
	"tax_code" varchar(80),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_billing_settings" ADD CONSTRAINT "business_billing_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_billing_settings" ADD CONSTRAINT "business_billing_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_credit_notes" ADD CONSTRAINT "business_credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_credit_notes" ADD CONSTRAINT "business_credit_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_credit_notes" ADD CONSTRAINT "business_credit_notes_invoice_id_business_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."business_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_credit_notes" ADD CONSTRAINT "business_credit_notes_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_document_sequences" ADD CONSTRAINT "business_document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_document_sequences" ADD CONSTRAINT "business_document_sequences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoice_items" ADD CONSTRAINT "business_invoice_items_invoice_id_business_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."business_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_quote_id_business_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."business_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_invoices" ADD CONSTRAINT "business_invoices_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_invoice_id_business_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."business_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_payments" ADD CONSTRAINT "business_payments_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quote_items" ADD CONSTRAINT "business_quote_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quote_items" ADD CONSTRAINT "business_quote_items_quote_id_business_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."business_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_quotes" ADD CONSTRAINT "business_quotes_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_tax_rates" ADD CONSTRAINT "business_tax_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_tax_rates" ADD CONSTRAINT "business_tax_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_billing_settings_org_workspace_uq" ON "business_billing_settings" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_credit_notes_org_number_uq" ON "business_credit_notes" USING btree ("organization_id","credit_note_number");--> statement-breakpoint
CREATE INDEX "business_credit_notes_org_invoice_idx" ON "business_credit_notes" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_document_sequences_scope_type_uq" ON "business_document_sequences" USING btree ("organization_id","workspace_id","document_type");--> statement-breakpoint
CREATE INDEX "business_invoice_items_invoice_idx" ON "business_invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "business_invoices_org_number_uq" ON "business_invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "business_invoices_org_status_due_idx" ON "business_invoices" USING btree ("organization_id","status","due_date");--> statement-breakpoint
CREATE INDEX "business_invoices_org_contact_idx" ON "business_invoices" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_payments_org_receipt_uq" ON "business_payments" USING btree ("organization_id","receipt_number");--> statement-breakpoint
CREATE INDEX "business_payments_org_invoice_idx" ON "business_payments" USING btree ("organization_id","invoice_id","paid_at");--> statement-breakpoint
CREATE INDEX "business_quote_items_quote_idx" ON "business_quote_items" USING btree ("quote_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "business_quotes_org_number_uq" ON "business_quotes" USING btree ("organization_id","quote_number");--> statement-breakpoint
CREATE INDEX "business_quotes_org_status_idx" ON "business_quotes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "business_quotes_org_contact_idx" ON "business_quotes" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_tax_rates_org_workspace_name_uq" ON "business_tax_rates" USING btree ("organization_id","workspace_id","name");