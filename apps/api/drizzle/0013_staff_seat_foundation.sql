CREATE TABLE "staff_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "branch_id" uuid,
  "organization_member_id" uuid,
  "manager_member_id" uuid,
  "employee_code" varchar(64) NOT NULL,
  "display_name" varchar(180) NOT NULL,
  "email" varchar(320),
  "phone" varchar(40),
  "designation" varchar(160),
  "department" varchar(160),
  "employment_type" varchar(32) DEFAULT 'FULL_TIME' NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "joining_date" date,
  "exit_date" date,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_seat_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "organization_member_id" uuid NOT NULL,
  "access_class" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "assigned_by_member_id" uuid,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_by_member_id" uuid,
  "revoked_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_manager_member_id_organization_members_id_fk" FOREIGN KEY ("manager_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD COLUMN "staff_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "attendance_employees" ADD CONSTRAINT "attendance_employees_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_seat_assignments" ADD CONSTRAINT "member_seat_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_seat_assignments" ADD CONSTRAINT "member_seat_assignments_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_seat_assignments" ADD CONSTRAINT "member_seat_assignments_assigned_by_member_id_organization_members_id_fk" FOREIGN KEY ("assigned_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_seat_assignments" ADD CONSTRAINT "member_seat_assignments_revoked_by_member_id_organization_members_id_fk" FOREIGN KEY ("revoked_by_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_org_code_uq" ON "staff_profiles" USING btree ("organization_id","employee_code");
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_org_member_uq" ON "staff_profiles" USING btree ("organization_id","organization_member_id");
--> statement-breakpoint
CREATE INDEX "staff_profiles_org_workspace_idx" ON "staff_profiles" USING btree ("organization_id","workspace_id");
--> statement-breakpoint
CREATE INDEX "staff_profiles_org_branch_status_idx" ON "staff_profiles" USING btree ("organization_id","branch_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "member_seat_assignments_member_uq" ON "member_seat_assignments" USING btree ("organization_member_id");
--> statement-breakpoint
CREATE INDEX "member_seat_assignments_org_class_status_idx" ON "member_seat_assignments" USING btree ("organization_id","access_class","status");
--> statement-breakpoint

INSERT INTO "staff_profiles" (
  "organization_id",
  "workspace_id",
  "branch_id",
  "organization_member_id",
  "manager_member_id",
  "employee_code",
  "display_name",
  "email",
  "phone",
  "designation",
  "department",
  "employment_type",
  "status",
  "joining_date",
  "exit_date",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  employee."organization_id",
  employee."workspace_id",
  employee."branch_id",
  employee."organization_member_id",
  employee."manager_member_id",
  employee."employee_code",
  employee."display_name",
  employee."email",
  employee."phone",
  employee."designation",
  department."name",
  employee."employment_type",
  employee."status",
  employee."joining_date",
  employee."exit_date",
  employee."metadata",
  employee."created_at",
  employee."updated_at"
FROM "attendance_employees" employee
LEFT JOIN "attendance_departments" department
  ON department."id" = employee."department_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

UPDATE "attendance_employees"
SET "staff_profile_id" = "staff_profiles"."id"
FROM "staff_profiles"
WHERE "staff_profiles"."organization_id" = "attendance_employees"."organization_id"
  AND "staff_profiles"."employee_code" = "attendance_employees"."employee_code"
  AND "attendance_employees"."staff_profile_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employees_staff_profile_uq" ON "attendance_employees" USING btree ("staff_profile_id");
--> statement-breakpoint

INSERT INTO "member_seat_assignments" (
  "organization_id",
  "organization_member_id",
  "access_class",
  "status",
  "assigned_by_member_id",
  "assigned_at",
  "created_at",
  "updated_at"
)
SELECT
  member."organization_id",
  member."id",
  'FULL',
  'ACTIVE',
  member."id",
  now(),
  now(),
  now()
FROM "organization_members" member
WHERE member."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "entitlements" (
  "organization_id",
  "key",
  "enabled",
  "limit_value",
  "source",
  "created_at",
  "updated_at"
)
SELECT organization."id", 'staff.records.max', true, NULL, 'SYSTEM', now(), now()
FROM "organizations" organization
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "entitlements" (
  "organization_id",
  "key",
  "enabled",
  "limit_value",
  "source",
  "created_at",
  "updated_at"
)
SELECT
  organization."id",
  'seats.full.max',
  true,
  COALESCE(legacy."limit_value", 5),
  'SYSTEM',
  now(),
  now()
FROM "organizations" organization
LEFT JOIN "entitlements" legacy
  ON legacy."organization_id" = organization."id"
 AND legacy."key" = 'users.max'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "entitlements" (
  "organization_id",
  "key",
  "enabled",
  "limit_value",
  "source",
  "created_at",
  "updated_at"
)
SELECT organization."id", 'seats.light.max', true, 0, 'SYSTEM', now(), now()
FROM "organizations" organization
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "entitlements" (
  "organization_id",
  "key",
  "enabled",
  "limit_value",
  "source",
  "created_at",
  "updated_at"
)
SELECT organization."id", 'seats.attendance.max', true, NULL, 'SYSTEM', now(), now()
FROM "organizations" organization
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "entitlements" (
  "organization_id",
  "key",
  "enabled",
  "limit_value",
  "source",
  "created_at",
  "updated_at"
)
SELECT organization."id", 'seats.guest.max', true, NULL, 'SYSTEM', now(), now()
FROM "organizations" organization
ON CONFLICT DO NOTHING;
