CREATE TABLE "developer_oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"name" varchar(160) NOT NULL,
	"description" text,
	"client_id" varchar(96) NOT NULL,
	"client_secret_hash" varchar(128) NOT NULL,
	"client_secret_prefix" varchar(24) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grant_types" jsonb DEFAULT '["client_credentials"]'::jsonb NOT NULL,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(180) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"response_status" integer,
	"response_body" text,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"name" varchar(160) NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signing_secret_ciphertext" text NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"name" varchar(180) NOT NULL,
	"version" varchar(40) NOT NULL,
	"publisher" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(80) DEFAULT 'INTEGRATION' NOT NULL,
	"manifest" jsonb NOT NULL,
	"required_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_subscriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"is_first_party" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"extension_id" uuid NOT NULL,
	"installed_by_member_id" uuid,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_identity_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"provider_type" varchar(32) DEFAULT 'OIDC' NOT NULL,
	"name" varchar(160) NOT NULL,
	"issuer_url" text NOT NULL,
	"client_id" varchar(240) NOT NULL,
	"client_secret_ciphertext" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"metadata" jsonb,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_identity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"subject" varchar(320) NOT NULL,
	"email" varchar(320) NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_oidc_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"state_hash" varchar(128) NOT NULL,
	"code_verifier_ciphertext" text NOT NULL,
	"return_to" text DEFAULT '/dashboard' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_scim_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"name" varchar(160) NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_security_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enforce_ip_allowlist" boolean DEFAULT false NOT NULL,
	"ip_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_max_minutes" integer DEFAULT 10080 NOT NULL,
	"audit_retention_days" integer DEFAULT 3650 NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise_sso_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"return_to" text DEFAULT '/dashboard' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "created_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "developer_oauth_clients" ADD CONSTRAINT "developer_oauth_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_oauth_clients" ADD CONSTRAINT "developer_oauth_clients_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_oauth_tokens" ADD CONSTRAINT "developer_oauth_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_oauth_tokens" ADD CONSTRAINT "developer_oauth_tokens_client_id_developer_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."developer_oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_webhook_deliveries" ADD CONSTRAINT "developer_webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_webhook_deliveries" ADD CONSTRAINT "developer_webhook_deliveries_endpoint_id_developer_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."developer_webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_webhook_endpoints" ADD CONSTRAINT "developer_webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_webhook_endpoints" ADD CONSTRAINT "developer_webhook_endpoints_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_extension_id_marketplace_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."marketplace_extensions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_installations" ADD CONSTRAINT "marketplace_installations_installed_by_member_id_organization_members_id_fk" FOREIGN KEY ("installed_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_identity_connections" ADD CONSTRAINT "enterprise_identity_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_identity_connections" ADD CONSTRAINT "enterprise_identity_connections_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_identity_links" ADD CONSTRAINT "enterprise_identity_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_identity_links" ADD CONSTRAINT "enterprise_identity_links_connection_id_enterprise_identity_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."enterprise_identity_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_identity_links" ADD CONSTRAINT "enterprise_identity_links_membership_id_organization_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_oidc_states" ADD CONSTRAINT "enterprise_oidc_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_oidc_states" ADD CONSTRAINT "enterprise_oidc_states_connection_id_enterprise_identity_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."enterprise_identity_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_scim_tokens" ADD CONSTRAINT "enterprise_scim_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_scim_tokens" ADD CONSTRAINT "enterprise_scim_tokens_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_security_policies" ADD CONSTRAINT "enterprise_security_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_sso_login_codes" ADD CONSTRAINT "enterprise_sso_login_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_sso_login_codes" ADD CONSTRAINT "enterprise_sso_login_codes_membership_id_organization_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_sso_login_codes" ADD CONSTRAINT "enterprise_sso_login_codes_connection_id_enterprise_identity_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."enterprise_identity_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_oauth_clients_client_id_uq" ON "developer_oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "developer_oauth_clients_org_idx" ON "developer_oauth_clients" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_oauth_tokens_hash_uq" ON "developer_oauth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "developer_oauth_tokens_org_idx" ON "developer_oauth_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "developer_oauth_tokens_client_idx" ON "developer_oauth_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_webhook_deliveries_endpoint_event_uq" ON "developer_webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "developer_webhook_deliveries_retry_idx" ON "developer_webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "developer_webhook_deliveries_org_created_idx" ON "developer_webhook_deliveries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "developer_webhook_endpoints_org_idx" ON "developer_webhook_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "developer_webhook_endpoints_status_idx" ON "developer_webhook_endpoints" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_extensions_key_version_uq" ON "marketplace_extensions" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "marketplace_extensions_status_idx" ON "marketplace_extensions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_installations_org_extension_uq" ON "marketplace_installations" USING btree ("organization_id","extension_id");--> statement-breakpoint
CREATE INDEX "marketplace_installations_org_status_idx" ON "marketplace_installations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "enterprise_identity_connections_org_idx" ON "enterprise_identity_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enterprise_identity_connections_status_idx" ON "enterprise_identity_connections" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_identity_links_connection_subject_uq" ON "enterprise_identity_links" USING btree ("connection_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_identity_links_connection_user_uq" ON "enterprise_identity_links" USING btree ("connection_id","user_id");--> statement-breakpoint
CREATE INDEX "enterprise_identity_links_org_idx" ON "enterprise_identity_links" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_oidc_states_hash_uq" ON "enterprise_oidc_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "enterprise_oidc_states_expiry_idx" ON "enterprise_oidc_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_scim_tokens_hash_uq" ON "enterprise_scim_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "enterprise_scim_tokens_org_idx" ON "enterprise_scim_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_security_policies_org_uq" ON "enterprise_security_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_sso_login_codes_hash_uq" ON "enterprise_sso_login_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "enterprise_sso_login_codes_expiry_idx" ON "enterprise_sso_login_codes" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_member_id_organization_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;