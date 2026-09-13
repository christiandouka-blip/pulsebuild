/**
 * Project ownership and assigned-project membership.
 *
 * A Project belongs to exactly one Organization.
 * Construction rows reference projectId only.
 *
 * current_phase_id is stored here but same-project phase membership is a
 * Phase 5C repository invariant (circular insert: project then phases).
 */

import {
  foreignKey,
  index,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { phaseStatusEnum, projectStatusEnum } from "@/drizzle/schema/enums";
import { utcTimestamp } from "@/drizzle/schema/columns";
import { organizationMemberships, organizations } from "@/drizzle/schema/identity";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    currentPhaseId: text("current_phase_id"),
    startDate: utcTimestamp("start_date"),
    targetDate: utcTimestamp("target_date"),
    status: projectStatusEnum("status").notNull(),
    /** IANA timezone for presentation. Instants are stored UTC. */
    timezone: text("timezone").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow(),
    updatedAt: utcTimestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("projects_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    index("projects_organization_id_idx").on(table.organizationId),
    foreignKey({
      name: "projects_organization_id_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
  ],
);

export const phases = pgTable(
  "phases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    plannedStart: utcTimestamp("planned_start"),
    plannedEnd: utcTimestamp("planned_end"),
    status: phaseStatusEnum("status").notNull(),
  },
  (table) => [
    unique("phases_id_project_id_unique").on(table.id, table.projectId),
    index("phases_project_id_idx").on(table.projectId),
    foreignKey({
      name: "phases_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
  ],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("project_memberships_user_project_unique").on(
      table.userId,
      table.projectId,
    ),
    index("project_memberships_project_id_idx").on(table.projectId),
    index("project_memberships_organization_id_idx").on(table.organizationId),
    foreignKey({
      name: "project_memberships_user_org_fk",
      columns: [table.userId, table.organizationId],
      foreignColumns: [
        organizationMemberships.userId,
        organizationMemberships.organizationId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "project_memberships_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
  ],
);
