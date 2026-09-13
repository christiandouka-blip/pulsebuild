/**
 * Project-scoped construction source tables.
 *
 * organizationId is not duplicated here. Tenant ownership is Project → Organization.
 * Requirement relations (task → crews/materials/equipment/dependencies) are join
 * tables. Assignment (crew.currentTaskId, equipment.assignedTaskId) stays on the
 * resource row — a different fact.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { utcTimestamp, utcTimestampNullable } from "@/drizzle/schema/columns";
import {
  crewStatusEnum,
  deliveryStatusEnum,
  equipmentStatusEnum,
  evidenceSourceTypeEnum,
  inspectionStatusEnum,
  permitStatusEnum,
  taskStateEnum,
  taskTypeEnum,
  weatherSeverityEnum,
} from "@/drizzle/schema/enums";
import { phases, projects } from "@/drizzle/schema/projects";

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    phaseId: text("phase_id").notNull(),
    name: text("name").notNull(),
    status: taskStateEnum("status").notNull(),
    taskType: taskTypeEnum("task_type").notNull(),
    plannedStart: utcTimestamp("planned_start"),
    plannedEnd: utcTimestamp("planned_end"),
    priorityWeight: integer("priority_weight").notNull(),
    isCriticalPath: boolean("is_critical_path").notNull(),
    actualStart: utcTimestampNullable("actual_start"),
    actualEnd: utcTimestampNullable("actual_end"),
  },
  (table) => [
    unique("tasks_id_project_id_unique").on(table.id, table.projectId),
    index("tasks_project_id_idx").on(table.projectId),
    foreignKey({
      name: "tasks_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tasks_phase_same_project_fk",
      columns: [table.phaseId, table.projectId],
      foreignColumns: [phases.id, phases.projectId],
    }).onDelete("restrict"),
  ],
);

export const crews = pgTable(
  "crews",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    trade: text("trade").notNull(),
    requiredWorkers: integer("required_workers").notNull(),
    availableWorkers: integer("available_workers").notNull(),
    status: crewStatusEnum("status").notNull(),
    /** Current assignment. Separate from task_required_crews. */
    currentTaskId: text("current_task_id"),
  },
  (table) => [
    unique("crews_id_project_id_unique").on(table.id, table.projectId),
    index("crews_project_id_idx").on(table.projectId),
    foreignKey({
      name: "crews_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "crews_current_task_same_project_fk",
      columns: [table.currentTaskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    deliveryStatus: deliveryStatusEnum("delivery_status").notNull(),
    expectedDeliveryTime: utcTimestamp("expected_delivery_time"),
    quantityExpected: integer("quantity_expected").notNull(),
    quantityReceived: integer("quantity_received").notNull(),
  },
  (table) => [
    unique("materials_id_project_id_unique").on(table.id, table.projectId),
    index("materials_project_id_idx").on(table.projectId),
    foreignKey({
      name: "materials_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
  ],
);

export const equipment = pgTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    status: equipmentStatusEnum("status").notNull(),
    /** Current allocation. Separate from task_required_equipment. */
    assignedTaskId: text("assigned_task_id"),
    availableFrom: utcTimestampNullable("available_from"),
  },
  (table) => [
    unique("equipment_id_project_id_unique").on(table.id, table.projectId),
    index("equipment_project_id_idx").on(table.projectId),
    foreignKey({
      name: "equipment_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "equipment_assigned_task_same_project_fk",
      columns: [table.assignedTaskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
  ],
);

export const inspections = pgTable(
  "inspections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    type: text("type").notNull(),
    status: inspectionStatusEnum("status").notNull(),
    requiredBeforeTaskId: text("required_before_task_id").notNull(),
    scheduledTime: utcTimestampNullable("scheduled_time"),
    inspectorName: text("inspector_name"),
  },
  (table) => [
    unique("inspections_id_project_id_unique").on(table.id, table.projectId),
    index("inspections_project_id_idx").on(table.projectId),
    foreignKey({
      name: "inspections_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "inspections_required_before_task_same_project_fk",
      columns: [table.requiredBeforeTaskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
  ],
);

export const permits = pgTable(
  "permits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    type: text("type").notNull(),
    status: permitStatusEnum("status").notNull(),
    requiredForTaskId: text("required_for_task_id").notNull(),
    expirationDate: utcTimestampNullable("expiration_date"),
  },
  (table) => [
    unique("permits_id_project_id_unique").on(table.id, table.projectId),
    index("permits_project_id_idx").on(table.projectId),
    foreignKey({
      name: "permits_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "permits_required_for_task_same_project_fk",
      columns: [table.requiredForTaskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
  ],
);

export const weatherEvents = pgTable(
  "weather_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    timestamp: utcTimestamp("timestamp"),
    condition: text("condition").notNull(),
    severity: weatherSeverityEnum("severity").notNull(),
    startTime: utcTimestamp("start_time"),
    endTime: utcTimestamp("end_time"),
  },
  (table) => [
    unique("weather_events_id_project_id_unique").on(table.id, table.projectId),
    index("weather_events_project_id_idx").on(table.projectId),
    foreignKey({
      name: "weather_events_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
  ],
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    evidenceType: text("evidence_type").notNull(),
    sourceType: evidenceSourceTypeEnum("source_type").notNull(),
    sourceRef: text("source_ref").notNull(),
    relatedEntityType: text("related_entity_type").notNull(),
    relatedEntityId: text("related_entity_id").notNull(),
    observedValue: text("observed_value").notNull(),
    timestamp: utcTimestamp("timestamp"),
    confidence: real("confidence"),
  },
  (table) => [
    unique("evidence_items_id_project_id_unique").on(table.id, table.projectId),
    index("evidence_items_project_id_idx").on(table.projectId),
    foreignKey({
      name: "evidence_items_project_id_fk",
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("restrict"),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id").notNull(),
    predecessorTaskId: text("predecessor_task_id").notNull(),
    projectId: text("project_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_dependencies_pk",
      columns: [table.taskId, table.predecessorTaskId],
    }),
    foreignKey({
      name: "task_dependencies_task_same_project_fk",
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_dependencies_predecessor_same_project_fk",
      columns: [table.predecessorTaskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
    check(
      "task_dependencies_no_self",
      sql`${table.taskId} <> ${table.predecessorTaskId}`,
    ),
  ],
);

export const taskRequiredCrews = pgTable(
  "task_required_crews",
  {
    taskId: text("task_id").notNull(),
    crewId: text("crew_id").notNull(),
    projectId: text("project_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_required_crews_pk",
      columns: [table.taskId, table.crewId],
    }),
    foreignKey({
      name: "task_required_crews_task_same_project_fk",
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_required_crews_crew_same_project_fk",
      columns: [table.crewId, table.projectId],
      foreignColumns: [crews.id, crews.projectId],
    }).onDelete("restrict"),
  ],
);

export const taskRequiredMaterials = pgTable(
  "task_required_materials",
  {
    taskId: text("task_id").notNull(),
    materialId: text("material_id").notNull(),
    projectId: text("project_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_required_materials_pk",
      columns: [table.taskId, table.materialId],
    }),
    foreignKey({
      name: "task_required_materials_task_same_project_fk",
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_required_materials_material_same_project_fk",
      columns: [table.materialId, table.projectId],
      foreignColumns: [materials.id, materials.projectId],
    }).onDelete("restrict"),
  ],
);

export const taskRequiredEquipment = pgTable(
  "task_required_equipment",
  {
    taskId: text("task_id").notNull(),
    equipmentId: text("equipment_id").notNull(),
    projectId: text("project_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_required_equipment_pk",
      columns: [table.taskId, table.equipmentId],
    }),
    foreignKey({
      name: "task_required_equipment_task_same_project_fk",
      columns: [table.taskId, table.projectId],
      foreignColumns: [tasks.id, tasks.projectId],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_required_equipment_equipment_same_project_fk",
      columns: [table.equipmentId, table.projectId],
      foreignColumns: [equipment.id, equipment.projectId],
    }).onDelete("restrict"),
  ],
);

export const weatherEventAffectedTaskTypes = pgTable(
  "weather_event_affected_task_types",
  {
    weatherEventId: text("weather_event_id").notNull(),
    projectId: text("project_id").notNull(),
    taskType: taskTypeEnum("task_type").notNull(),
  },
  (table) => [
    primaryKey({
      name: "weather_event_affected_task_types_pk",
      columns: [table.weatherEventId, table.taskType],
    }),
    foreignKey({
      name: "weather_event_affected_task_types_event_same_project_fk",
      columns: [table.weatherEventId, table.projectId],
      foreignColumns: [weatherEvents.id, weatherEvents.projectId],
    }).onDelete("restrict"),
  ],
);
