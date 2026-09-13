import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";

import { ORGANIZATION_ROLES } from "@/domain/tenancy";
import {
  crews,
  equipment,
  evidenceItems,
  inspections,
  materials,
  organizationMemberships,
  organizationRoleEnum,
  organizations,
  permits,
  phases,
  projectMemberships,
  projects,
  taskDependencies,
  taskRequiredCrews,
  taskRequiredEquipment,
  taskRequiredMaterials,
  tasks,
  users,
  weatherEventAffectedTaskTypes,
  weatherEvents,
} from "@/drizzle/schema";

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

function uniqueColumnGroups(table: Parameters<typeof getTableConfig>[0]): string[][] {
  return getTableConfig(table).uniqueConstraints.map((constraint) =>
    constraint.columns.map((column) => column.name),
  );
}

function foreignKeys(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((key) => {
    const reference = key.reference();
    return {
      columns: reference.columns.map((column) => column.name),
      foreignTable: getTableConfig(reference.foreignTable).name,
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: key.onDelete,
    };
  });
}

function hasForeignKey(
  table: Parameters<typeof getTableConfig>[0],
  expected: {
    columns: string[];
    foreignTable: string;
    foreignColumns: string[];
  },
): boolean {
  return foreignKeys(table).some(
    (key) =>
      key.foreignTable === expected.foreignTable &&
      key.columns.join() === expected.columns.join() &&
      key.foreignColumns.join() === expected.foreignColumns.join(),
  );
}

const CONSTRUCTION_TABLES = [
  phases,
  tasks,
  crews,
  materials,
  equipment,
  inspections,
  permits,
  weatherEvents,
  evidenceItems,
  taskDependencies,
  taskRequiredCrews,
  taskRequiredMaterials,
  taskRequiredEquipment,
  weatherEventAffectedTaskTypes,
] as const;

describe("Phase 5A production schema", () => {
  it("role enum has exactly the four approved values", () => {
    expect(ORGANIZATION_ROLES).toEqual([
      "Owner",
      "ProjectManager",
      "Superintendent",
      "Viewer",
    ]);
    expect(organizationRoleEnum.enumValues).toEqual([...ORGANIZATION_ROLES]);
  });

  it("organization membership is unique per user and organization", () => {
    expect(uniqueColumnGroups(organizationMemberships)).toContainEqual([
      "user_id",
      "organization_id",
    ]);
    expect(
      hasForeignKey(organizationMemberships, {
        columns: ["user_id"],
        foreignTable: "users",
        foreignColumns: ["id"],
      }),
    ).toBe(true);
    expect(
      hasForeignKey(organizationMemberships, {
        columns: ["organization_id"],
        foreignTable: "organizations",
        foreignColumns: ["id"],
      }),
    ).toBe(true);
    expect(
      foreignKeys(organizationMemberships).every((key) => key.onDelete === "restrict"),
    ).toBe(true);
  });

  it("project requires organization ownership", () => {
    expect(columnNames(projects)).toContain("organization_id");
    expect(
      hasForeignKey(projects, {
        columns: ["organization_id"],
        foreignTable: "organizations",
        foreignColumns: ["id"],
      }),
    ).toBe(true);
    expect(uniqueColumnGroups(projects)).toContainEqual([
      "id",
      "organization_id",
    ]);
    expect(columnNames(projects)).toContain("timezone");
    expect(columnNames(projects)).not.toContain("current_simulated_at");
  });

  it("project assignment supports multiple users per project without duplicating role", () => {
    expect(columnNames(projectMemberships)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "organization_id",
        "project_id",
        "created_at",
      ]),
    );
    expect(columnNames(projectMemberships)).not.toContain("role");
    expect(uniqueColumnGroups(projectMemberships)).toContainEqual([
      "user_id",
      "project_id",
    ]);
    expect(
      hasForeignKey(projectMemberships, {
        columns: ["user_id", "organization_id"],
        foreignTable: "organization_memberships",
        foreignColumns: ["user_id", "organization_id"],
      }),
    ).toBe(true);
    expect(
      hasForeignKey(projectMemberships, {
        columns: ["project_id", "organization_id"],
        foreignTable: "projects",
        foreignColumns: ["id", "organization_id"],
      }),
    ).toBe(true);
  });

  it("construction tables are project-scoped and omit organizationId", () => {
    for (const table of CONSTRUCTION_TABLES) {
      const names = columnNames(table);
      expect(names, getTableConfig(table).name).toContain("project_id");
      expect(names, getTableConfig(table).name).not.toContain("organization_id");
    }
  });

  it("required task relationships have one authoritative task-to-resource direction", () => {
    expect(columnNames(taskRequiredCrews)).toEqual(
      expect.arrayContaining(["task_id", "crew_id", "project_id"]),
    );
    expect(columnNames(taskRequiredMaterials)).toEqual(
      expect.arrayContaining(["task_id", "material_id", "project_id"]),
    );
    expect(columnNames(taskRequiredEquipment)).toEqual(
      expect.arrayContaining(["task_id", "equipment_id", "project_id"]),
    );
    expect(columnNames(taskDependencies)).toEqual(
      expect.arrayContaining(["task_id", "predecessor_task_id", "project_id"]),
    );
    expect(
      hasForeignKey(taskRequiredCrews, {
        columns: ["task_id", "project_id"],
        foreignTable: "tasks",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
    expect(
      hasForeignKey(taskRequiredCrews, {
        columns: ["crew_id", "project_id"],
        foreignTable: "crews",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
    expect(getTableConfig(taskDependencies).checks.map((item) => item.name)).toContain(
      "task_dependencies_no_self",
    );
  });

  it("crew assignment remains separate from crew requirement", () => {
    expect(columnNames(crews)).toContain("current_task_id");
    expect(columnNames(crews)).not.toContain("required_by_task_id");
    expect(
      hasForeignKey(crews, {
        columns: ["current_task_id", "project_id"],
        foreignTable: "tasks",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
    expect(columnNames(taskRequiredCrews)).toContain("crew_id");
    expect(columnNames(taskRequiredCrews)).not.toContain("current_task_id");
  });

  it("equipment allocation remains separate from equipment requirement", () => {
    expect(columnNames(equipment)).toContain("assigned_task_id");
    expect(
      hasForeignKey(equipment, {
        columns: ["assigned_task_id", "project_id"],
        foreignTable: "tasks",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
    expect(columnNames(taskRequiredEquipment)).toContain("equipment_id");
    expect(columnNames(taskRequiredEquipment)).not.toContain("assigned_task_id");
  });

  it("inspection gating direction is required-before-task", () => {
    expect(columnNames(inspections)).toContain("required_before_task_id");
    expect(columnNames(inspections)).not.toContain("required_for_task_id");
    expect(
      hasForeignKey(inspections, {
        columns: ["required_before_task_id", "project_id"],
        foreignTable: "tasks",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
  });

  it("permit relation direction is required-for-task", () => {
    expect(columnNames(permits)).toContain("required_for_task_id");
    expect(columnNames(permits)).not.toContain("required_before_task_id");
    expect(
      hasForeignKey(permits, {
        columns: ["required_for_task_id", "project_id"],
        foreignTable: "tasks",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
  });

  it("does not duplicate organizationId across construction records", () => {
    const identityTables = [
      getTableConfig(organizations).name,
      getTableConfig(organizationMemberships).name,
      getTableConfig(projects).name,
      getTableConfig(projectMemberships).name,
    ];
    expect(identityTables).toEqual([
      "organizations",
      "organization_memberships",
      "projects",
      "project_memberships",
    ]);
    for (const table of CONSTRUCTION_TABLES) {
      expect(columnNames(table)).not.toContain("organization_id");
    }
  });

  it("schema modules are server/data-layer only", () => {
    const dbSource = readFileSync("lib/db/schema.ts", "utf8");
    expect(dbSource).toContain("Do not import from components/");
    expect(dbSource).toContain("No live database client");
    expect(dbSource.includes("DATABASE_URL")).toBe(false);
    expect(dbSource.includes("process.env")).toBe(false);
  });

  it("frozen engines and Agent/Voice import no DB code", () => {
    const forbidden = [
      "@/lib/db",
      "@/drizzle",
      "drizzle-orm",
      "drizzle-kit",
      "DATABASE_URL",
    ];
    const files = [
      "domain/engines/reasoningPipeline.ts",
      "domain/decisions/runtime.ts",
      "domain/effects/runtime.ts",
      "domain/recovery/runtime.ts",
      "domain/agent/types.ts",
      "domain/voice/types.ts",
      "lib/agent/explain.ts",
      "lib/voice/eligibility.ts",
      "store/useReasoningStore.ts",
      "store/useVoiceStore.ts",
      "store/useAgentStore.ts",
      "components/chat/AgentChatPanelShell.tsx",
      "components/command-center/CommandCenterShell.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("users and organizations exist as identity roots", () => {
    expect(columnNames(users)).toEqual(
      expect.arrayContaining(["id", "email", "display_name", "created_at", "updated_at"]),
    );
    expect(uniqueColumnGroups(users)).toContainEqual(["email"]);
    expect(columnNames(organizations)).toEqual(
      expect.arrayContaining(["id", "name", "created_at", "updated_at"]),
    );
  });

  it("phase belongs to a project and task phase is same-project", () => {
    expect(columnNames(phases)).toContain("project_id");
    expect(
      hasForeignKey(tasks, {
        columns: ["phase_id", "project_id"],
        foreignTable: "phases",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
  });

  it("weather and evidence are project-scoped source records", () => {
    expect(columnNames(weatherEvents)).toEqual(
      expect.arrayContaining([
        "id",
        "project_id",
        "timestamp",
        "condition",
        "severity",
        "start_time",
        "end_time",
      ]),
    );
    expect(columnNames(evidenceItems)).toEqual(
      expect.arrayContaining([
        "id",
        "project_id",
        "evidence_type",
        "source_type",
        "source_ref",
        "related_entity_type",
        "related_entity_id",
        "observed_value",
        "timestamp",
      ]),
    );
    expect(
      hasForeignKey(weatherEventAffectedTaskTypes, {
        columns: ["weather_event_id", "project_id"],
        foreignTable: "weather_events",
        foreignColumns: ["id", "project_id"],
      }),
    ).toBe(true);
  });
});
