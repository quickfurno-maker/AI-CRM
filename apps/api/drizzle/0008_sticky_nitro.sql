ALTER TABLE "re_site_visits" DROP CONSTRAINT "re_site_visits_project_id_re_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "re_site_visits" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "re_site_visits" ADD CONSTRAINT "re_site_visits_project_id_re_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."re_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "re_units_org_status_price_idx" ON "re_units" USING btree ("organization_id","inventory_status","price");--> statement-breakpoint
CREATE INDEX "re_units_org_status_carpet_idx" ON "re_units" USING btree ("organization_id","inventory_status","carpet_area");