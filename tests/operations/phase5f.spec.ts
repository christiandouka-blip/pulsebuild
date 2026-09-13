import { describe, expect, it } from "vitest";

import { createFixedClock } from "@/lib/import/clock";
import { MemoryOperationalStore } from "@/lib/operations/memoryBackend";
import { commitProductionObservation } from "@/lib/operations/service";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";
import { createMemoryProjectWorldSource } from "@/tests/repositories/memoryWorldSource";
import {
  cloneRecords,
  productionRecords,
} from "@/tests/repositories/recordsFactory";

const ORG_A = "org-a";
const ORG_B = "org-b";
const PROJECT_A = "proj-midwest-tower";
const PROJECT_B = "proj-org-b";
const CLOCK_1 = "2026-09-08T15:00:00.000Z";

function identity(userId: string) {
  return { userId, email: `${userId}@pulsebuild.test`, displayName: userId };
}

function delayedMaterialRecords() {
  const records = cloneRecords(productionRecords(ORG_A));
  const material = records.materials[0];
  if (material) {
    material.deliveryStatus = "delayed";
    material.quantityReceived = 0;
  }
  return records;
}

async function setupWorld(records = delayedMaterialRecords()) {
  const directory = new MemoryIdentityDirectory();
  directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
  directory.users.set("viewer-a", makeUser("viewer-a", "viewer-a@pulsebuild.test"));
  directory.users.set("owner-b", makeUser("owner-b", "owner-b@pulsebuild.test"));
  directory.memberships.push(
    makeMembership("owner-a", ORG_A, "Owner"),
    makeMembership("viewer-a", ORG_A, "Viewer"),
    makeMembership("owner-b", ORG_B, "Owner"),
  );
  directory.projects.push(
    { id: PROJECT_A, organizationId: ORG_A },
    { id: PROJECT_B, organizationId: ORG_B },
  );
  directory.assignments.push(
    { userId: "viewer-a", projectId: PROJECT_A, organizationId: ORG_A },
  );
  const repository = createProjectRepository(
    createMemoryProjectWorldSource([records]),
  );
  const store = new MemoryOperationalStore();
  return { directory, repository, store };
}

function weatherObservation() {
  return {
    signalType: "WeatherAlert" as const,
    title: "Wind advisory",
    description: "Wind affects outdoor pour window.",
    relatedEntityType: "weather",
    relatedEntityId: "wx-clear",
    relatedTaskId: "task-pour",
    payload: { condition: "Wind", severity: "moderate" },
  };
}

describe("Phase 5F observation commit", () => {
  it("commits an authorized production observation", async () => {
    const { directory, repository, store } = await setupWorld();
    const result = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weatherObservation(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(result.status).toBe("Committed");
    if (result.status !== "Committed") return;
    expect(result.operational.reasoning.reasonings).toHaveLength(1);
    expect(result.operational.reasoning.reasonings[0]?.signal.type).toBe(
      "WeatherAlert",
    );
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(1);
  });

  it("creates zero writes when observation is unauthorized", async () => {
    const { directory, repository, store } = await setupWorld();
    const result = await commitProductionObservation({
      identity: identity("viewer-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weatherObservation(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(result.status).toBe("CapabilityDenied");
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(0);
  });

  it("rejects cross-tenant observation ids", async () => {
    const { directory, repository, store } = await setupWorld();
    const result = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_B,
      observation: weatherObservation(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(result.status).toBe("ProjectNotFound");
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_B })).toBe(0);
  });

  it("creates zero partial writes for invalid observation data", async () => {
    const { directory, repository, store } = await setupWorld();
    const result = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: {
        ...weatherObservation(),
        relatedEntityId: "missing-weather",
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(result.status).toBe("InvalidObservation");
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(0);
  });
});
