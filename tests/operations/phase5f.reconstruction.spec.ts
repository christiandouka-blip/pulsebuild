import { afterEach, describe, expect, it } from "vitest";

import { createFixedClock } from "@/lib/import/clock";
import { MemoryOperationalStore } from "@/lib/operations/memoryBackend";
import {
  commitProductionDecision,
  commitProductionObservation,
  loadOperationalWorkspace,
} from "@/lib/operations/service";
import { presentationScores } from "@/lib/selectors/recoveryPresentationSelectors";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { HARBOR_POINT_PROJECT_ID } from "@/tests/repositories/recordsFactory";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { createMemoryProjectWorldSource } from "@/tests/repositories/memoryWorldSource";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";
import {
  cloneRecords,
  productionRecords,
} from "@/tests/repositories/recordsFactory";

const ORG_A = "org-a";
const PROJECT_A = "proj-midwest-tower";
const CLOCK_1 = "2026-09-08T15:00:00.000Z";
const CLOCK_2 = "2026-09-08T16:00:00.000Z";
const CLOCK_3 = "2026-09-08T17:00:00.000Z";

function identity(userId: string) {
  return { userId, email: `${userId}@pulsebuild.test`, displayName: userId };
}

async function setup() {
  const records = cloneRecords(productionRecords(ORG_A));
  if (records.materials[0]) {
    records.materials[0].deliveryStatus = "delayed";
    records.materials[0].quantityReceived = 0;
  }
  const directory = new MemoryIdentityDirectory();
  directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
  directory.memberships.push(makeMembership("owner-a", ORG_A, "Owner"));
  directory.projects.push({ id: PROJECT_A, organizationId: ORG_A });
  return {
    directory,
    repository: createProjectRepository(createMemoryProjectWorldSource([records])),
    store: new MemoryOperationalStore(),
  };
}

function weather() {
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

describe("Phase 5F page-refresh reconstruction", () => {
  afterEach(() => {
    useProjectStore.setState({
      snapshot: null,
      isLoaded: false,
      source: "demo",
      operational: null,
    });
    useReasoningStore.setState({ isInitialized: false });
    useSimulatedClockStore.setState({ clock: null, timeAuthority: "simulated" });
  });

  it("reconstructs observation, reasoning, and recommendation after discarding runtime", async () => {
    const { directory, repository, store } = await setup();
    const committed = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(committed.status).toBe("Committed");
    if (committed.status !== "Committed") return;
    const loaded = await loadOperationalWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    expect(loaded.operational.reasoning.reasonings).toHaveLength(1);
    expect(loaded.operational.reasoning.reasonings[0]?.recommendation?.id).toBe(
      committed.operational.reasoning.reasonings[0]?.recommendation?.id,
    );
    expect(loaded.snapshot.project.id).not.toBe(HARBOR_POINT_PROJECT_ID);
  });

  it("persists a valid FSM transition and stores the authenticated actor id", async () => {
    const { directory, repository, store } = await setup();
    const observed = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(observed.status).toBe("Committed");
    if (observed.status !== "Committed") return;
    const decision = observed.operational.decisions.decisions[0];
    expect(decision).toBeDefined();
    if (!decision) return;
    const requiresApproval = observed.operational.reasoning.reasonings[0]?.recommendation?.approval.required;
    const approved = await commitProductionDecision({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      decision: {
        decisionId: decision.id,
        commands: requiresApproval
          ? [
              { type: "ApproveDecision", selectedActionSource: "primary" },
              { type: "ProceedAfterApproval" },
            ]
          : [{ type: "AcknowledgeDecision" }],
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(approved.status).toBe("Committed");
    if (approved.status !== "Committed") return;
    expect(store.inspect({ organizationId: ORG_A, projectId: PROJECT_A })?.commands.at(-1)?.actorUserId).toBe(
      "owner-a",
    );
    const loaded = await loadOperationalWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_3),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    expect(loaded.operational.decisions.decisions[0]?.state).toBe(
      approved.operational.decisions.decisions[0]?.state,
    );
  });

  it("does not persist an invalid FSM transition", async () => {
    const { directory, repository, store } = await setup();
    const observed = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(observed.status).toBe("Committed");
    if (observed.status !== "Committed") return;
    const decisionId = observed.operational.decisions.decisions[0]?.id;
    if (!decisionId) return;
    const invalid = await commitProductionDecision({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      decision: { decisionId, commands: [{ type: "VerifyDecision" }] },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(invalid.status).toBe("InvalidTransition");
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(1);
  });

  it("treats a duplicate observation as idempotent", async () => {
    const { directory, repository, store } = await setup();
    const first = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    const second = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(first.status).toBe("Committed");
    expect(second.status).toBe("AlreadyCommitted");
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(1);
  });

  it("handles concurrent decision transitions safely", async () => {
    const { directory, repository, store } = await setup();
    const observed = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(observed.status).toBe("Committed");
    if (observed.status !== "Committed") return;
    const decisionId = observed.operational.decisions.decisions[0]?.id;
    if (!decisionId) return;
    const requiresApproval = observed.operational.reasoning.reasonings[0]?.recommendation?.approval.required;
    const version = observed.operational.workflowVersion;
    const results = await Promise.all([
      commitProductionDecision({
        identity: identity("owner-a"),
        requestedOrganizationId: ORG_A,
        projectId: PROJECT_A,
        decision: {
          decisionId,
          expectedWorkflowVersion: version,
          commands: requiresApproval
            ? [
                { type: "ApproveDecision", selectedActionSource: "primary" },
                { type: "ProceedAfterApproval" },
              ]
            : [{ type: "AcknowledgeDecision" }],
        },
        directory,
        repository,
        store,
        clock: createFixedClock(CLOCK_2),
      }),
      commitProductionDecision({
        identity: identity("owner-a"),
        requestedOrganizationId: ORG_A,
        projectId: PROJECT_A,
        decision: {
          decisionId,
          expectedWorkflowVersion: version,
          commands: [{ type: "RejectDecision", reason: "Not now" }],
        },
        directory,
        repository,
        store,
        clock: createFixedClock(CLOCK_2),
      }),
    ]);
    const statuses = results.map((item) => item.status);
    expect(statuses).toContain("Committed");
    expect(
      statuses.some(
        (status) =>
          status === "PersistenceConflict" ||
          status === "InvalidTransition" ||
          status === "AlreadyCommitted",
      ),
    ).toBe(true);
  });

  it("reconstructs Health and Drift from recovered material delay", async () => {
    const { directory, repository, store } = await setup();
    const delayed = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: {
        signalType: "MaterialDeliveryDelayed",
        title: "Concrete delayed",
        description: "Ready-mix ETA slipped.",
        relatedEntityType: "material",
        relatedEntityId: "mat-a",
        relatedTaskId: "task-pour",
        payload: { deliveryStatus: "delayed" },
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(delayed.status).toBe("Committed");
    if (delayed.status !== "Committed") return;
    const received = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: {
        signalType: "DeliveryReceived",
        title: "Concrete received",
        description: "Ready-mix arrived.",
        relatedEntityType: "material",
        relatedEntityId: "mat-a",
        relatedTaskId: "task-pour",
        payload: { deliveryStatus: "received", quantityReceived: 100 },
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(received.status).toBe("Committed");
    if (received.status !== "Committed") return;
    expect(
      received.operational.recovery.history.some((event) => event.type === "Recovered"),
    ).toBe(true);
    const before = presentationScores(
      received.operational.reasoning,
      received.operational.recovery,
    );
    const loaded = await loadOperationalWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_3),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    const after = presentationScores(
      loaded.operational.reasoning,
      loaded.operational.recovery,
    );
    expect(after.health.score).toBe(before.health.score);
    expect(after.drift.score).toBe(before.drift.score);
    expect(loaded.operational.recovery.currentlyRecoveredIssueIds).toEqual(
      received.operational.recovery.currentlyRecoveredIssueIds,
    );
    const recovered = loaded.operational.recovery.history.filter(
      (event) => event.type === "Recovered",
    );
    expect(new Set(recovered.map((event) => event.episodeNumber)).size).toBe(
      recovered.length,
    );
    const times = loaded.operational.reasoning.timeline.map((event) => event.sequenceOrder);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
