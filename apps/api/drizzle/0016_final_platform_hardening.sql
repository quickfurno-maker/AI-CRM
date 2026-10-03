CREATE TABLE "tenant_onboarding_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "dismissed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_viewed_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid,
  "category" varchar(64) NOT NULL,
  "severity" varchar(24) DEFAULT 'INFO' NOT NULL,
  "title" varchar(220) NOT NULL,
  "body" text NOT NULL,
  "action_href" text,
  "status" varchar(24) DEFAULT 'UNREAD' NOT NULL,
  "dedupe_key" varchar(240),
  "metadata" jsonb,
  "read_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "created_by_member_id" uuid NOT NULL,
  "assigned_provider_user_id" uuid,
  "ticket_number" varchar(64) NOT NULL,
  "category" varchar(64) NOT NULL,
  "priority" varchar(24) DEFAULT 'NORMAL' NOT NULL,
  "status" varchar(32) DEFAULT 'OPEN' NOT NULL,
  "subject" varchar(240) NOT NULL,
  "description" text NOT NULL,
  "related_resource_type" varchar(80),
  "related_resource_id" varchar(180),
  "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "author_type" varchar(24) NOT NULL,
  "author_id" uuid,
  "body" text NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_governance_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "audit_retention_days" integer DEFAULT 3650 NOT NULL,
  "notification_retention_days" integer DEFAULT 365 NOT NULL,
  "support_retention_days" integer DEFAULT 1095 NOT NULL,
  "ai_trace_retention_days" integer DEFAULT 365 NOT NULL,
  "deletion_grace_days" integer DEFAULT 30 NOT NULL,
  "legal_hold" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_governance_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "requested_by_member_id" uuid NOT NULL,
  "reviewed_by_user_id" uuid,
  "request_type" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING_REVIEW' NOT NULL,
  "reason" text,
  "review_note" text,
  "manifest" jsonb,
  "scheduled_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_onboarding_states" ADD CONSTRAINT "tenant_onboarding_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_notifications" ADD CONSTRAINT "tenant_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_notifications" ADD CONSTRAINT "tenant_notifications_membership_id_organization_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_provider_user_id_users_id_fk" FOREIGN KEY ("assigned_provider_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_ticket_comments" ADD CONSTRAINT "support_ticket_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_ticket_comments" ADD CONSTRAINT "support_ticket_comments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_governance_policies" ADD CONSTRAINT "data_governance_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_governance_requests" ADD CONSTRAINT "data_governance_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_governance_requests" ADD CONSTRAINT "data_governance_requests_requested_by_member_id_organization_members_id_fk" FOREIGN KEY ("requested_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_governance_requests" ADD CONSTRAINT "data_governance_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_onboarding_states_org_uq" ON "tenant_onboarding_states" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_notifications_org_dedupe_uq" ON "tenant_notifications" USING btree ("organization_id","dedupe_key");
--> statement-breakpoint
CREATE INDEX "tenant_notifications_member_status_idx" ON "tenant_notifications" USING btree ("organization_id","membership_id","status");
--> statement-breakpoint
CREATE INDEX "tenant_notifications_org_created_idx" ON "tenant_notifications" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_number_uq" ON "support_tickets" USING btree ("ticket_number");
--> statement-breakpoint
CREATE INDEX "support_tickets_org_status_idx" ON "support_tickets" USING btree ("organization_id","status","last_activity_at");
--> statement-breakpoint
CREATE INDEX "support_tickets_provider_status_idx" ON "support_tickets" USING btree ("status","priority","last_activity_at");
--> statement-breakpoint
CREATE INDEX "support_ticket_comments_ticket_created_idx" ON "support_ticket_comments" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "data_governance_policies_org_uq" ON "data_governance_policies" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "data_governance_requests_org_status_idx" ON "data_governance_requests" USING btree ("organization_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "data_governance_requests_status_idx" ON "data_governance_requests" USING btree ("status","created_at");