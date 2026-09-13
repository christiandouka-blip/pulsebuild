CREATE TYPE "public"."import_file_type" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('Uploaded', 'Parsed', 'NeedsReview', 'ReadyToImport', 'Imported', 'Rejected', 'Failed');--> statement-breakpoint
CREATE TABLE "project_import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"project_id" text,
	"source_filename" text NOT NULL,
	"source_type" "import_file_type" NOT NULL,
	"status" "import_job_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"validated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"error_count" integer NOT NULL,
	"warning_count" integer NOT NULL,
	"phase_count" integer NOT NULL,
	"task_count" integer NOT NULL,
	"crew_count" integer NOT NULL,
	"material_count" integer NOT NULL,
	"equipment_count" integer NOT NULL,
	"inspection_count" integer NOT NULL,
	"permit_count" integer NOT NULL,
	"critical_path_count" integer NOT NULL,
	"staging_payload" jsonb,
	"issues" jsonb NOT NULL,
	"selected_current_phase_external_id" text,
	"warnings_acknowledged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_import_jobs" ADD CONSTRAINT "project_import_jobs_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import_jobs" ADD CONSTRAINT "project_import_jobs_actor_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import_jobs" ADD CONSTRAINT "project_import_jobs_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_import_jobs_organization_id_idx" ON "project_import_jobs" USING btree ("organization_id");