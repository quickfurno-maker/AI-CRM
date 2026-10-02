CREATE TABLE "re_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"requirement_id" uuid,
	"deal_id" uuid,
	"offer_id" uuid,
	"unit_id" uuid NOT NULL,
	"broker_id" uuid,
	"status" varchar(32) DEFAULT 'RESERVED' NOT NULL,
	"booking_amount" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_reference" varchar(160),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"firm_name" varchar(240),
	"registration_number" varchar(160),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"code" varchar(100),
	"floors" integer,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"possession_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"broker_id" uuid,
	"commission_type" varchar(32) DEFAULT 'FIXED' NOT NULL,
	"rate" numeric(8, 4),
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"payable_at" date,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(240) NOT NULL,
	"code" varchar(100),
	"rera_registration" varchar(160),
	"website" text,
	"phone" varchar(40),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid,
	"deal_id" uuid,
	"unit_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"valid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"developer_id" uuid,
	"name" varchar(240) NOT NULL,
	"code" varchar(100),
	"city" varchar(120) NOT NULL,
	"locality" varchar(160) NOT NULL,
	"address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"rera_number" varchar(160),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"possession_date" date,
	"property_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_price" numeric(18, 2),
	"max_price" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_property_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_type" varchar(32) DEFAULT 'INDIVIDUAL' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_requirement_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'SUGGESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"owner_member_id" uuid,
	"purpose" varchar(32) DEFAULT 'SELF_USE' NOT NULL,
	"cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"localities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"property_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configurations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_budget" numeric(18, 2),
	"max_budget" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"min_carpet_area" numeric(12, 2),
	"max_carpet_area" numeric(12, 2),
	"purchase_timeline" varchar(80),
	"possession_preference" varchar(80),
	"must_have_amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"deal_id" uuid,
	"project_id" uuid NOT NULL,
	"unit_id" uuid,
	"appointment_id" uuid,
	"owner_member_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'SCHEDULED' NOT NULL,
	"outcome" varchar(48),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "re_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"building_id" uuid,
	"property_owner_id" uuid,
	"unit_number" varchar(100),
	"title" varchar(240) NOT NULL,
	"city" varchar(120),
	"locality" varchar(160),
	"address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"property_type" varchar(48) NOT NULL,
	"configuration" varchar(80),
	"bedrooms" integer,
	"bathrooms" integer,
	"carpet_area" numeric(12, 2),
	"built_up_area" numeric(12, 2),
	"area_unit" varchar(24) DEFAULT 'SQFT' NOT NULL,
	"floor" integer,
	"facing" varchar(48),
	"price" numeric(18, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"inventory_status" varchar(32) DEFAULT 'AVAILABLE' NOT NULL,
	"possession_status" varchar(48),
	"available_from" date,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_requirement_id_re_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."re_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_offer_id_re_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."re_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_unit_id_re_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."re_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_bookings" ADD CONSTRAINT "re_bookings_broker_id_re_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."re_brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_brokers" ADD CONSTRAINT "re_brokers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_brokers" ADD CONSTRAINT "re_brokers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_brokers" ADD CONSTRAINT "re_brokers_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_buildings" ADD CONSTRAINT "re_buildings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_buildings" ADD CONSTRAINT "re_buildings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_buildings" ADD CONSTRAINT "re_buildings_project_id_re_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."re_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_commissions" ADD CONSTRAINT "re_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_commissions" ADD CONSTRAINT "re_commissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_commissions" ADD CONSTRAINT "re_commissions_booking_id_re_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."re_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_commissions" ADD CONSTRAINT "re_commissions_broker_id_re_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."re_brokers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_developers" ADD CONSTRAINT "re_developers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_developers" ADD CONSTRAINT "re_developers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_offers" ADD CONSTRAINT "re_offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_offers" ADD CONSTRAINT "re_offers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_offers" ADD CONSTRAINT "re_offers_requirement_id_re_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."re_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_offers" ADD CONSTRAINT "re_offers_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_offers" ADD CONSTRAINT "re_offers_unit_id_re_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."re_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_projects" ADD CONSTRAINT "re_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_projects" ADD CONSTRAINT "re_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_projects" ADD CONSTRAINT "re_projects_developer_id_re_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."re_developers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_property_owners" ADD CONSTRAINT "re_property_owners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_property_owners" ADD CONSTRAINT "re_property_owners_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_property_owners" ADD CONSTRAINT "re_property_owners_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirement_matches" ADD CONSTRAINT "re_requirement_matches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirement_matches" ADD CONSTRAINT "re_requirement_matches_requirement_id_re_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."re_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirement_matches" ADD CONSTRAINT "re_requirement_matches_unit_id_re_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."re_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirements" ADD CONSTRAINT "re_requirements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirements" ADD CONSTRAINT "re_requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirements" ADD CONSTRAINT "re_requirements_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirements" ADD CONSTRAINT "re_requirements_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_requirements" ADD CONSTRAINT "re_requirements_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_requirement_id_re_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."re_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_project_id_re_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."re_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_unit_id_re_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."re_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_appointment_id_crm_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."crm_appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_owner_member_id_organization_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_units" ADD CONSTRAINT "re_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_units" ADD CONSTRAINT "re_units_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_units" ADD CONSTRAINT "re_units_project_id_re_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."re_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_units" ADD CONSTRAINT "re_units_building_id_re_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."re_buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "re_units" ADD CONSTRAINT "re_units_property_owner_id_re_property_owners_id_fk" FOREIGN KEY ("property_owner_id") REFERENCES "public"."re_property_owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "re_bookings_org_status_idx" ON "re_bookings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "re_bookings_org_unit_idx" ON "re_bookings" USING btree ("organization_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "re_brokers_org_contact_uq" ON "re_brokers" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "re_buildings_org_project_idx" ON "re_buildings" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "re_commissions_org_booking_idx" ON "re_commissions" USING btree ("organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "re_commissions_org_status_idx" ON "re_commissions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "re_developers_org_workspace_idx" ON "re_developers" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "re_developers_org_name_idx" ON "re_developers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "re_offers_org_unit_idx" ON "re_offers" USING btree ("organization_id","unit_id");--> statement-breakpoint
CREATE INDEX "re_offers_org_deal_idx" ON "re_offers" USING btree ("organization_id","deal_id");--> statement-breakpoint
CREATE INDEX "re_projects_org_workspace_idx" ON "re_projects" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "re_projects_org_city_locality_idx" ON "re_projects" USING btree ("organization_id","city","locality");--> statement-breakpoint
CREATE INDEX "re_projects_developer_idx" ON "re_projects" USING btree ("organization_id","developer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "re_property_owners_org_contact_uq" ON "re_property_owners" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "re_requirement_matches_pair_uq" ON "re_requirement_matches" USING btree ("requirement_id","unit_id");--> statement-breakpoint
CREATE INDEX "re_requirement_matches_org_requirement_idx" ON "re_requirement_matches" USING btree ("organization_id","requirement_id");--> statement-breakpoint
CREATE INDEX "re_requirements_org_contact_idx" ON "re_requirements" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "re_requirements_org_status_idx" ON "re_requirements" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "re_site_visits_org_schedule_idx" ON "re_site_visits" USING btree ("organization_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "re_site_visits_org_contact_idx" ON "re_site_visits" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "re_units_org_workspace_idx" ON "re_units" USING btree ("organization_id","workspace_id");--> statement-breakpoint
CREATE INDEX "re_units_org_project_status_idx" ON "re_units" USING btree ("organization_id","project_id","inventory_status");--> statement-breakpoint
CREATE INDEX "re_units_org_type_config_idx" ON "re_units" USING btree ("organization_id","property_type","configuration");--> statement-breakpoint
CREATE INDEX "re_units_org_city_locality_idx" ON "re_units" USING btree ("organization_id","city","locality");