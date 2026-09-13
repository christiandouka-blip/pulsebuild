CREATE TYPE "public"."crew_status" AS ENUM('available', 'assigned', 'idle', 'off_site');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('ordered', 'in_transit', 'delayed', 'received', 'partial');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('available', 'assigned', 'maintenance', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('seed', 'simulation', 'user', 'system');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('not_scheduled', 'scheduled', 'passed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('Owner', 'ProjectManager', 'Superintendent', 'Viewer');--> statement-breakpoint
CREATE TYPE "public"."permit_status" AS ENUM('pending', 'approved', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."phase_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('Planned', 'Ready', 'Waiting', 'Blocked', 'Executing', 'Paused', 'Completed', 'Verified', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('sitework', 'concrete', 'framing', 'steel', 'interior_prep', 'envelope', 'electrical_rough', 'plumbing_rough', 'drywall', 'finishes');--> statement-breakpoint
CREATE TYPE "public"."weather_severity" AS ENUM('low', 'moderate', 'high', 'severe');--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "organization_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_user_org_unique" UNIQUE("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"planned_start" timestamp with time zone NOT NULL,
	"planned_end" timestamp with time zone NOT NULL,
	"status" "phase_status" NOT NULL,
	CONSTRAINT "phases_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_memberships_user_project_unique" UNIQUE("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"current_phase_id" text,
	"start_date" timestamp with time zone NOT NULL,
	"target_date" timestamp with time zone NOT NULL,
	"status" "project_status" NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_organization_id_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"trade" text NOT NULL,
	"required_workers" integer NOT NULL,
	"available_workers" integer NOT NULL,
	"status" "crew_status" NOT NULL,
	"current_task_id" text,
	CONSTRAINT "crews_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "equipment_status" NOT NULL,
	"assigned_task_id" text,
	"available_from" timestamp with time zone,
	CONSTRAINT "equipment_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"source_ref" text NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" text NOT NULL,
	"observed_value" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"confidence" real,
	CONSTRAINT "evidence_items_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"status" "inspection_status" NOT NULL,
	"required_before_task_id" text NOT NULL,
	"scheduled_time" timestamp with time zone,
	"inspector_name" text,
	CONSTRAINT "inspections_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"delivery_status" "delivery_status" NOT NULL,
	"expected_delivery_time" timestamp with time zone NOT NULL,
	"quantity_expected" integer NOT NULL,
	"quantity_received" integer NOT NULL,
	CONSTRAINT "materials_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"status" "permit_status" NOT NULL,
	"required_for_task_id" text NOT NULL,
	"expiration_date" timestamp with time zone,
	CONSTRAINT "permits_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" text NOT NULL,
	"predecessor_task_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "task_dependencies_pk" PRIMARY KEY("task_id","predecessor_task_id"),
	CONSTRAINT "task_dependencies_no_self" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."predecessor_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_required_crews" (
	"task_id" text NOT NULL,
	"crew_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "task_required_crews_pk" PRIMARY KEY("task_id","crew_id")
);
--> statement-breakpoint
CREATE TABLE "task_required_equipment" (
	"task_id" text NOT NULL,
	"equipment_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "task_required_equipment_pk" PRIMARY KEY("task_id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "task_required_materials" (
	"task_id" text NOT NULL,
	"material_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "task_required_materials_pk" PRIMARY KEY("task_id","material_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "task_state" NOT NULL,
	"task_type" "task_type" NOT NULL,
	"planned_start" timestamp with time zone NOT NULL,
	"planned_end" timestamp with time zone NOT NULL,
	"priority_weight" integer NOT NULL,
	"is_critical_path" boolean NOT NULL,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	CONSTRAINT "tasks_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "weather_event_affected_task_types" (
	"weather_event_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_type" "task_type" NOT NULL,
	CONSTRAINT "weather_event_affected_task_types_pk" PRIMARY KEY("weather_event_id","task_type")
);
--> statement-breakpoint
CREATE TABLE "weather_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"condition" text NOT NULL,
	"severity" "weather_severity" NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	CONSTRAINT "weather_events_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_org_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."organization_memberships"("user_id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_current_task_same_project_fk" FOREIGN KEY ("current_task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_assigned_task_same_project_fk" FOREIGN KEY ("assigned_task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_required_before_task_same_project_fk" FOREIGN KEY ("required_before_task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_required_for_task_same_project_fk" FOREIGN KEY ("required_for_task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_same_project_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_same_project_fk" FOREIGN KEY ("predecessor_task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_crews" ADD CONSTRAINT "task_required_crews_task_same_project_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_crews" ADD CONSTRAINT "task_required_crews_crew_same_project_fk" FOREIGN KEY ("crew_id","project_id") REFERENCES "public"."crews"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_equipment" ADD CONSTRAINT "task_required_equipment_task_same_project_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_equipment" ADD CONSTRAINT "task_required_equipment_equipment_same_project_fk" FOREIGN KEY ("equipment_id","project_id") REFERENCES "public"."equipment"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_materials" ADD CONSTRAINT "task_required_materials_task_same_project_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "public"."tasks"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_required_materials" ADD CONSTRAINT "task_required_materials_material_same_project_fk" FOREIGN KEY ("material_id","project_id") REFERENCES "public"."materials"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_same_project_fk" FOREIGN KEY ("phase_id","project_id") REFERENCES "public"."phases"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_event_affected_task_types" ADD CONSTRAINT "weather_event_affected_task_types_event_same_project_fk" FOREIGN KEY ("weather_event_id","project_id") REFERENCES "public"."weather_events"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_events" ADD CONSTRAINT "weather_events_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "phases_project_id_idx" ON "phases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_memberships_project_id_idx" ON "project_memberships" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_memberships_organization_id_idx" ON "project_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crews_project_id_idx" ON "crews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "equipment_project_id_idx" ON "equipment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "evidence_items_project_id_idx" ON "evidence_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inspections_project_id_idx" ON "inspections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "materials_project_id_idx" ON "materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "permits_project_id_idx" ON "permits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "weather_events_project_id_idx" ON "weather_events" USING btree ("project_id");