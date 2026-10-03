CREATE TABLE "saas_payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"checkout_session_id" uuid,
	"invoice_id" uuid,
	"dunning_case_id" uuid,
	"provider" varchar(40) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(32) DEFAULT 'CREATING' NOT NULL,
	"provider_order_id" varchar(240),
	"provider_payment_id" varchar(240),
	"failure_code" varchar(120),
	"failure_reason" text,
	"idempotency_key" varchar(240) NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_payment_gateway_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_event_id" varchar(240) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'RECEIVED' NOT NULL,
	"provider_order_id" varchar(240),
	"provider_payment_id" varchar(240),
	"payload" jsonb NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saas_payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"payment_intent_id" uuid,
	"provider" varchar(40) NOT NULL,
	"provider_payment_id" varchar(240) NOT NULL,
	"provider_refund_id" varchar(240),
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(32) DEFAULT 'CREATING' NOT NULL,
	"reason" text,
	"idempotency_key" varchar(240) NOT NULL,
	"metadata" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_payment_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_customer_id" varchar(240),
	"provider_method_id" varchar(240),
	"provider_mandate_id" varchar(240),
	"method_type" varchar(40),
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_label" varchar(120),
	"metadata" jsonb,
	"authorized_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_payment_intents" ADD CONSTRAINT "saas_payment_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_intents" ADD CONSTRAINT "saas_payment_intents_checkout_session_id_saas_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."saas_checkout_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_intents" ADD CONSTRAINT "saas_payment_intents_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_intents" ADD CONSTRAINT "saas_payment_intents_dunning_case_id_saas_dunning_cases_id_fk" FOREIGN KEY ("dunning_case_id") REFERENCES "public"."saas_dunning_cases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_refunds" ADD CONSTRAINT "saas_payment_refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_refunds" ADD CONSTRAINT "saas_payment_refunds_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_refunds" ADD CONSTRAINT "saas_payment_refunds_receipt_id_saas_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."saas_receipts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_refunds" ADD CONSTRAINT "saas_payment_refunds_payment_intent_id_saas_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."saas_payment_intents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saas_payment_mandates" ADD CONSTRAINT "saas_payment_mandates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_intents_provider_idempotency_uq" ON "saas_payment_intents" USING btree ("provider","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_intents_provider_order_uq" ON "saas_payment_intents" USING btree ("provider","provider_order_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_intents_org_status_idx" ON "saas_payment_intents" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "saas_payment_intents_checkout_idx" ON "saas_payment_intents" USING btree ("checkout_session_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_intents_invoice_idx" ON "saas_payment_intents" USING btree ("invoice_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_gateway_events_provider_event_uq" ON "saas_payment_gateway_events" USING btree ("provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_gateway_events_status_received_idx" ON "saas_payment_gateway_events" USING btree ("status","received_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_refunds_provider_idempotency_uq" ON "saas_payment_refunds" USING btree ("provider","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_refunds_provider_refund_uq" ON "saas_payment_refunds" USING btree ("provider","provider_refund_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_refunds_receipt_idx" ON "saas_payment_refunds" USING btree ("receipt_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_refunds_org_status_idx" ON "saas_payment_refunds" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_payment_mandates_provider_mandate_uq" ON "saas_payment_mandates" USING btree ("provider","provider_mandate_id");
--> statement-breakpoint
CREATE INDEX "saas_payment_mandates_org_status_idx" ON "saas_payment_mandates" USING btree ("organization_id","status");