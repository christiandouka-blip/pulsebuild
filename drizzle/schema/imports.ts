/**
 * Project import staging jobs. Not construction operational tables.
 * Raw workbooks are not stored.
 */

import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

import { utcTimestamp, utcTimestampNullable } from "@/drizzle/schema/columns";
import {
  importFileTypeEnum,
  importJobStatusEnum,
} from "@/drizzle/schema/enums";
import { organizations, users } from "@/drizzle/schema/identity";
import { projects } from "@/drizzle/schema/projects";

export const projectImportJobs = pgTable(
  "project_import_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    projectId: text("project_id"),
    sourceFilename: text("source_filename").notNull(),
    sourceType: importFileTypeEnum("source_type").notNull(),
    status: importJobStatusEnum("status").notNull(),
    createdAt: utcTimestamp("created_at"),
    validatedAt: utcTimestampNullable("validated_at"),
    confirmedAt: utcTimestampNullable("confirmed_at"),
    errorCount: integer("error_count").notNull(),
    warningCount: integer("warning_count").notNull(),
    phaseCount: integer("phase_count").notNull(),
    taskCount: integer("task_count").notNull(),
    crewCount: integer("crew_count").notNull(),
    materialCount: integer("material_count").notNull(),
    equipmentCount: integer("equipment_count").notNull(),
    inspectionCount: integer("inspection_count").notNull(),
    permitCount: integer("permit_count").notNull(),
    criticalPathCount: integer("critical_path_count").notNull(),
    stagingPayload: jsonb("staging_payload"),
    issues: jsonb("issues").notNull(),
    selectedCurrentPhaseExternalId: text("selected_current_phase_external_id"),
    warningsAcknowledged: boolean("warnings_acknowledged").notNull().default(false),
  },
  (table) => [
    index("project_import_jobs_organization_id_idx").on(table.organizationId),
    foreignKey({
      name: "project_import_jobs_organization_id_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_import_jobs_actor_user_id_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_import_jobs_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
  ],
);
