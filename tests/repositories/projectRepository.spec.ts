import { describe, expect, it, vi } from "vitest";

import * as harborPointValidation from "@/domain/validation/validateHarborPointSeedSnapshot";
import * as genericValidation from "@/domain/validation/validateProjectSnapshot";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { mapProjectSnapshot } from "@/lib/repositories/projectSnapshotMapper";
import type { LoadProjectSnapshotInput } from "@/lib/repositories/types";
import { productionConstructionSnapshot } from "@/tests/validation/productionSnapshot";
import {
  createMemoryProjectWorldSource,
  createThrowingProjectWorldSource,
} from "@/tests/repositories/memoryWorldSource";
import {
  ACTOR_USER_ID,
  cloneRecords,
  HARBOR_POINT_OPERATIONAL_AT,
  HARBOR_POINT_ORGANIZATION_ID,
  HARBOR_POINT_PROJECT_ID,
  harborPointRecords,
  OTHER_ORGANIZATION_ID,
  productionRecords,
} from "@/tests/repositories/recordsFactory";

const OPERATIONAL_AT = "2026-09-07T15:00:00.000Z";

function productionInput(
  overrides: Partial<LoadProjectSnapshotInput> = {},
): LoadProjectSnapshotInput {
  const records = productionRecords();
  return {
    tenantScope: {
      organizationId: records.project.organizationId,
      actorUserId: ACTOR_USER_ID,
    },
    projectId: records.project.id,
    currentOperationalAt: OPERATIONAL_AT,
    ...overrides,
  };
}

describe("production ProjectRepository", () => {
  it("requires TenantScope organization and actor", async () => {
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([productionRecords()]),
    );
    const missingOrg = await repository.loadProjectSnapshot(
      productionInput({
        tenantScope: { organizationId: "", actorUserId: ACTOR_USER_ID },
      }),
    );
    const missingActor = await repository.loadProjectSnapshot(
      productionInput({
        tenantScope: {
          organizationId: productionRecords().project.organizationId,
          actorUserId: "",
        },
      }),
    );
    expect(missingOrg.status).toBe("InvalidProjectData");
    expect(missingActor.status).toBe("InvalidProjectData");
  });

  it("loads the project for the matching organization", async () => {
    const records = productionRecords();
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([records]),
    );
    const result = await repository.loadProjectSnapshot(productionInput());
    expect(result.status).toBe("Loaded");
    if (result.status === "Loaded") {
      expect(result.snapshot.project.id).toBe(records.project.id);
      expect(result.snapshot.project.currentSimulatedAt).toBe(OPERATIONAL_AT);
      expect(result.snapshot.scenarioFixtures).toEqual([]);
    }
  });

  it("does not load a project for the wrong organization", async () => {
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([productionRecords()]),
    );
    const result = await repository.loadProjectSnapshot(
      productionInput({
        tenantScope: {
          organizationId: OTHER_ORGANIZATION_ID,
          actorUserId: ACTOR_USER_ID,
        },
      }),
    );
    expect(result).toEqual({ status: "ProjectNotFound" });
  });

  it("returns the same not-found result for a cross-tenant id", async () => {
    const owned = productionRecords(HARBOR_POINT_ORGANIZATION_ID);
    const foreign = harborPointRecords(OTHER_ORGANIZATION_ID);
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([owned, foreign]),
    );
    const missing = await repository.loadProjectSnapshot(
      productionInput({
        tenantScope: {
          organizationId: owned.project.organizationId,
          actorUserId: ACTOR_USER_ID,
        },
        projectId: HARBOR_POINT_PROJECT_ID,
      }),
    );
    const unknown = await repository.loadProjectSnapshot(
      productionInput({
        projectId: "proj-does-not-exist",
      }),
    );
    expect(missing).toEqual({ status: "ProjectNotFound" });
    expect(unknown).toEqual({ status: "ProjectNotFound" });
  });

  it("keeps actorUserId on TenantScope without using it as a query key", async () => {
    const records = productionRecords();
    let seen: { organizationId: string; projectId: string } | undefined;
    const repository = createProjectRepository({
      async loadProjectWorld(input) {
        seen = input;
        return records.project.organizationId === input.organizationId &&
          records.project.id === input.projectId
          ? records
          : null;
      },
    });
    const result = await repository.loadProjectSnapshot(productionInput());
    expect(result.status).toBe("Loaded");
    expect(seen).toEqual({
      organizationId: records.project.organizationId,
      projectId: records.project.id,
    });
    expect(seen).not.toHaveProperty("actorUserId");
  });

  it("invokes validateProjectSnapshot and never Harbor Point seed validation", async () => {
    const genericSpy = vi.spyOn(genericValidation, "validateProjectSnapshot");
    const harborSpy = vi.spyOn(
      harborPointValidation,
      "validateHarborPointSeedSnapshot",
    );
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([productionRecords()]),
    );
    const result = await repository.loadProjectSnapshot(productionInput());
    expect(result.status).toBe("Loaded");
    expect(genericSpy).toHaveBeenCalled();
    expect(harborSpy).not.toHaveBeenCalled();
    genericSpy.mockRestore();
    harborSpy.mockRestore();
  });

  it("never returns Loaded for invalid snapshot data", async () => {
    const records = productionRecords();
    records.project.currentPhaseId = "phase-missing";
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([records]),
    );
    const result = await repository.loadProjectSnapshot(productionInput());
    expect(result.status).toBe("InvalidProjectData");
    if (result.status === "InvalidProjectData") {
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.join(" ")).not.toContain("password");
    }
  });

  it("maps database failure to DatabaseUnavailable", async () => {
    const repository = createProjectRepository(createThrowingProjectWorldSource());
    const result = await repository.loadProjectSnapshot(productionInput());
    expect(result).toEqual({
      status: "DatabaseUnavailable",
      message: "Project database is unavailable",
    });
  });

  it("returns deep-equal snapshots for the same rows and operational time", async () => {
    const records = productionRecords();
    const repository = createProjectRepository(
      createMemoryProjectWorldSource([records]),
    );
    const first = await repository.loadProjectSnapshot(productionInput());
    const second = await repository.loadProjectSnapshot(productionInput());
    expect(first).toEqual(second);
  });

  it("does not mutate input row fixtures", () => {
    const records = productionRecords();
    const before = cloneRecords(records);
    mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(records).toEqual(before);
  });
});

describe("production mapper field mapping", () => {
  it("maps project fields and explicit operational time", () => {
    const mapped = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.project.name).toBe("Midwest Tower");
      expect(mapped.snapshot.project.location).toBe("Chicago yard");
      expect(mapped.snapshot.project.status).toBe("active");
      expect(mapped.snapshot.project.timezone).toBe("America/Chicago");
      expect(mapped.snapshot.project.currentSimulatedAt).toBe(OPERATIONAL_AT);
      expect(mapped.snapshot.scenarioFixtures).toEqual([]);
    }
  });

  it("maps an arbitrary valid IANA timezone", () => {
    const records = productionRecords("org-midwest", {
      project: {
        ...productionConstructionSnapshot().project,
        timezone: "Pacific/Auckland",
      },
    });
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.project.timezone).toBe("Pacific/Auckland");
    }
  });

  it("rejects an invalid timezone through the generic validator", () => {
    const records = productionRecords("org-midwest", {
      project: {
        ...productionConstructionSnapshot().project,
        timezone: "Not/AZone",
      },
    });
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
    if (mapped.status === "InvalidProjectData") {
      expect(mapped.diagnostics.some((item) => item.includes("time zone"))).toBe(
        true,
      );
    }
  });

  it("maps phases and accepts a valid currentPhaseId", () => {
    const mapped = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.phases.map((phase) => phase.id)).toEqual([
        "phase-structure",
      ]);
      expect(mapped.snapshot.project.currentPhaseId).toBe("phase-structure");
    }
  });

  it("rejects a missing currentPhaseId target", () => {
    const records = productionRecords();
    records.project.currentPhaseId = "phase-absent";
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
  });

  it("rejects a cross-project currentPhase target", () => {
    const records = productionRecords();
    records.phases[0] = {
      ...records.phases[0],
      projectId: "proj-other",
    };
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
  });

  it("maps task fields exactly from persistence", () => {
    const mapped = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      const pour = mapped.snapshot.tasks.find((task) => task.id === "task-pour");
      expect(pour?.status).toBe("Ready");
      expect(pour?.taskType).toBe("concrete");
      expect(pour?.priorityWeight).toBe(10);
      expect(pour?.isCriticalPath).toBe(true);
      expect(pour?.dependencyTaskIds).toEqual(["task-foundation"]);
      expect(pour?.requiredCrewIds).toEqual(["crew-a"]);
      expect(pour?.requiredMaterialIds).toEqual(["mat-a"]);
      expect(pour?.requiredEquipmentIds).toEqual(["equip-a"]);
    }
  });

  it("reconstructs dependency direction and rejects invalid dependencies", () => {
    const records = productionRecords();
    records.taskDependencies.push({
      taskId: "task-pour",
      predecessorTaskId: "task-missing",
      projectId: records.project.id,
    });
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
  });

  it("rejects a dependency cycle through the generic validator", () => {
    const records = productionRecords();
    records.taskDependencies.push({
      taskId: "task-foundation",
      predecessorTaskId: "task-pour",
      projectId: records.project.id,
    });
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
    if (mapped.status === "InvalidProjectData") {
      expect(mapped.diagnostics.some((item) => item.includes("cycle"))).toBe(true);
    }
  });

  it("does not invent inverse requirement collections", () => {
    const mapped = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.crews[0]).not.toHaveProperty("requiredByTaskIds");
      expect(mapped.snapshot.materials[0]).not.toHaveProperty("relatedTaskIds");
      expect(mapped.snapshot.equipment[0]).not.toHaveProperty("requiredByTaskIds");
      expect(mapped.snapshot.tasks[0]).not.toHaveProperty("requiredInspectionIds");
      expect(mapped.snapshot.tasks[0]).not.toHaveProperty("requiredPermitIds");
    }
  });

  it("maps crew assignment independently of requirements", () => {
    const records = productionRecords();
    records.taskRequiredCrews = records.taskRequiredCrews.filter(
      (row) => row.taskId !== "task-foundation",
    );
    records.crews[0] = {
      ...records.crews[0],
      currentTaskId: "task-foundation",
    };
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.crews[0].currentTaskId).toBe("task-foundation");
      expect(
        mapped.snapshot.tasks.find((task) => task.id === "task-foundation")
          ?.requiredCrewIds,
      ).toEqual([]);
    }
  });

  it("rejects an assignment to a task outside the loaded project", () => {
    const records = productionRecords();
    records.crews[0] = {
      ...records.crews[0],
      currentTaskId: "task-missing",
    };
    expect(mapProjectSnapshot(records, OPERATIONAL_AT).status).toBe(
      "InvalidProjectData",
    );
  });

  it("maps equipment allocation independently of requirements", () => {
    const records = productionRecords();
    records.taskRequiredEquipment = records.taskRequiredEquipment.filter(
      (row) => row.taskId !== "task-foundation",
    );
    records.equipment[0] = {
      ...records.equipment[0],
      assignedTaskId: "task-foundation",
    };
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.equipment[0].assignedTaskId).toBe("task-foundation");
      expect(
        mapped.snapshot.tasks.find((task) => task.id === "task-foundation")
          ?.requiredEquipmentIds,
      ).toEqual([]);
    }
  });

  it("rejects an invalid equipment allocation target", () => {
    const records = productionRecords();
    records.equipment[0] = {
      ...records.equipment[0],
      assignedTaskId: "task-missing",
    };
    expect(mapProjectSnapshot(records, OPERATIONAL_AT).status).toBe(
      "InvalidProjectData",
    );
  });

  it("maps inspection and permit gating task ids", () => {
    const mapped = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.inspections[0].requiredBeforeTaskId).toBe("task-pour");
      expect(mapped.snapshot.permits[0].requiredForTaskId).toBe("task-pour");
    }
  });

  it("rejects invalid inspection and permit task refs", () => {
    const inspectionRecords = productionRecords();
    inspectionRecords.inspections[0] = {
      ...inspectionRecords.inspections[0],
      requiredBeforeTaskId: "task-missing",
    };
    const permitRecords = productionRecords();
    permitRecords.permits[0] = {
      ...permitRecords.permits[0],
      requiredForTaskId: "task-missing",
    };
    expect(mapProjectSnapshot(inspectionRecords, OPERATIONAL_AT).status).toBe(
      "InvalidProjectData",
    );
    expect(mapProjectSnapshot(permitRecords, OPERATIONAL_AT).status).toBe(
      "InvalidProjectData",
    );
  });

  it("maps weather events and affected task types", () => {
    const records = productionRecords("org-midwest", {
      weather: [
        {
          id: "wx-clear",
          projectId: "proj-midwest-tower",
          timestamp: "2026-09-07T15:00:00.000Z",
          condition: "Wind",
          severity: "moderate",
          affectedTaskTypes: ["concrete", "steel"],
          startTime: "2026-09-07T12:00:00.000Z",
          endTime: "2026-09-07T20:00:00.000Z",
        },
      ],
    });
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.weather[0].condition).toBe("Wind");
      expect(mapped.snapshot.weather[0].affectedTaskTypes).toEqual([
        "concrete",
        "steel",
      ]);
    }
  });

  it("maps evidence and rejects an unresolvable entity reference", () => {
    const valid = mapProjectSnapshot(productionRecords(), OPERATIONAL_AT);
    expect(valid.status).toBe("Mapped");
    if (valid.status === "Mapped") {
      expect(valid.snapshot.evidence[0].relatedEntityId).toBe("proj-midwest-tower");
    }

    const records = productionRecords();
    records.evidenceItems[0] = {
      ...records.evidenceItems[0],
      relatedEntityType: "task",
      relatedEntityId: "task-missing",
    };
    const mapped = mapProjectSnapshot(records, OPERATIONAL_AT);
    expect(mapped.status).toBe("InvalidProjectData");
  });

  it("preserves Harbor Point operational time when supplied explicitly", () => {
    const mapped = mapProjectSnapshot(
      harborPointRecords(),
      HARBOR_POINT_OPERATIONAL_AT,
    );
    expect(mapped.status).toBe("Mapped");
    if (mapped.status === "Mapped") {
      expect(mapped.snapshot.project.currentSimulatedAt).toBe(
        HARBOR_POINT_OPERATIONAL_AT,
      );
      expect(mapped.snapshot.scenarioFixtures).toEqual([]);
    }
  });
});
