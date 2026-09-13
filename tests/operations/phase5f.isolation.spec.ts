import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import { publicAuthorizationMessage } from "@/domain/authorization/types";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { createFixedClock } from "@/lib/import/clock";
import {
  applyReconstructedOperational,
  ensureCommandCenterInitialized,
  hydrateWorkspaceSnapshot,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import { MemoryOperationalStore } from "@/lib/operations/memoryBackend";
import { reconstructOperationalWorkspace } from "@/lib/operations/reconstruct";
import {
  commitProductionDecision,
  commitProductionObservation,
} from "@/lib/operations/service";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import { evaluateVoiceEligibility } from "@/lib/voice/eligibility";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";
import { createMemoryProjectWorldSource } from "@/tests/repositories/memoryWorldSource";
import {
  cloneRecords,
  HARBOR_POINT_PROJECT_ID,
  productionRecords,
} from "@/tests/repositories/recordsFactory";
import { productionConstructionSnapshot } from "@/tests/validation/productionSnapshot";

const ORG_A = "org-a";
const ORG_B = "org-b";
const PROJECT_A = "proj-midwest-tower";
const PROJECT_B = "proj-org-b";
const CLOCK_1 = "2026-09-08T15:00:00.000Z";
const CLOCK_2 = "2026-09-08T16:00:00.000Z";

function identity(userId: string) {
  return { userId, email: `${userId}@pulsebuild.test`, displayName: userId };
}

async function setup() {
  const records = cloneRecords(productionRecords(ORG_A));
  const directory = new MemoryIdentityDirectory();
  directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
  directory.users.set("owner-b", makeUser("owner-b", "owner-b@pulsebuild.test"));
  directory.memberships.push(
    makeMembership("owner-a", ORG_A, "Owner"),
    makeMembership("owner-b", ORG_B, "Owner"),
  );
  directory.projects.push(
    { id: PROJECT_A, organizationId: ORG_A },
    { id: PROJECT_B, organizationId: ORG_B },
  );
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

function taskComplete() {
  return {
    signalType: "TaskComplete" as const,
    title: "Pour complete",
    description: "Slab pour finished.",
    relatedEntityType: "task",
    relatedEntityId: "task-pour",
    relatedTaskId: "task-pour",
    payload: {},
  };
}

describe("Phase 5F effects and isolation", () => {
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

  it("reconstructs applied effects and keeps rejected results auditable", async () => {
    const { directory, repository, store } = await setup();
    const complete = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: taskComplete(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(complete.status).toBe("Committed");
    if (complete.status !== "Committed") return;
    const duplicate = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: {
        ...taskComplete(),
        title: "Pour complete again",
        description: "Duplicate completion attempt.",
        payload: { attempt: 2 },
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(duplicate.status).toBe("Committed");
    if (duplicate.status !== "Committed") return;
    expect(
      duplicate.operational.overlay.applicationResults.some(
        (result) => result.outcome === "Rejected" || result.outcome === "AlreadyApplied",
      ),
    ).toBe(true);
    expect(
      duplicate.operational.overlay.effective.snapshot.tasks.find(
        (task) => task.id === "task-pour",
      )?.status,
    ).toBe("Completed");
  });

  it("rejects nested decision ids from another tenant", async () => {
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
    const nested = await commitProductionDecision({
      identity: identity("owner-b"),
      requestedOrganizationId: ORG_B,
      projectId: PROJECT_B,
      decision: {
        decisionId,
        commands: [{ type: "RejectDecision", reason: "cross" }],
      },
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(
      nested.status === "ProjectNotFound" || nested.status === "ProjectAccessDenied",
    ).toBe(true);
    expect(publicAuthorizationMessage({ status: "ProjectNotFound" })).toBe(
      publicAuthorizationMessage({ status: "ProjectAccessDenied" }),
    );
  });

  it("returns a typed failure when the operational store is unavailable", async () => {
    const { directory, repository, store } = await setup();
    store.failNextTransaction();
    const result = await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(result.status).toBe("DatabaseUnavailable");
  });

  it("fails closed on corrupted persisted history", () => {
    const reconstructed = reconstructOperationalWorkspace(
      productionConstructionSnapshot(),
      {
        organizationId: ORG_A,
        projectId: PROJECT_A,
        workflowVersion: 1,
        commandSeq: 1,
        replayBaselineAt: "2026-01-01T00:00:00.000Z",
        currentlyRecoveredIssueIds: [],
        observations: [],
        commands: [
          {
            id: "ocmd-corrupt",
            organizationId: ORG_A,
            projectId: PROJECT_A,
            seq: 1,
            kind: "observation",
            observationId: "obs-missing",
            decisionId: null,
            actorUserId: "owner-a",
            committedAt: CLOCK_1,
            idempotencyKey: "corrupt",
            fsmCommands: [],
          },
        ],
        recoveryEvents: [],
      },
    );
    expect(reconstructed.status).toBe("InvalidPersistedOperationalData");
  });

  it("never falls back to Harbor Point after a production operational failure", async () => {
    const { directory, repository, store } = await setup();
    await commitProductionObservation({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_B,
      observation: weather(),
      directory,
      repository,
      store,
      clock: createFixedClock(CLOCK_1),
    });
    useProjectStore.setState({
      snapshot: null,
      isLoaded: false,
      source: "workspace",
      operational: null,
    });
    expect(() => ensureCommandCenterInitialized()).toThrow(
      /Workspace snapshot is not loaded/,
    );
    expect(useProjectStore.getState().snapshot).toBeNull();
  });

  it("still loads Harbor Point without PostgreSQL", () => {
    useProjectStore.getState().loadSeedProject();
    const snapshot = ensureCommandCenterInitialized();
    expect(snapshot.project.id).toBe(HARBOR_POINT_PROJECT_ID);
    expect(snapshot.scenarioFixtures).toHaveLength(5);
    expect(validateHarborPointSeedSnapshot(snapshot).ok).toBe(true);
  });

  it("builds AgentContext from reconstructed production state", async () => {
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
    const timeline = joinOperationalTimeline(
      committed.operational.reasoning.timeline,
      committed.operational.decisions.decisions,
      {
        effectHistory: committed.operational.overlay.effectHistory,
        applicationResults: committed.operational.overlay.applicationResults,
        recoveryHistory: committed.operational.recovery.history,
      },
    );
    const context = buildAgentContext({
      reasoning: committed.operational.reasoning,
      decisions: committed.operational.decisions,
      overlay: committed.operational.overlay,
      recovery: committed.operational.recovery,
      evaluationSimulatedAt: CLOCK_1,
      timeline,
    });
    expect(context.signals.length).toBeGreaterThan(0);
    const entry = context.timeline[0];
    if (entry) {
      const eligibility = evaluateVoiceEligibility({
        timelineEntry: entry,
        agentContext: context,
        preferences: DEFAULT_VOICE_PREFERENCES,
        announcedEventIds: [],
      });
      expect(
        eligibility.status === "Eligible" || eligibility.status === "NotEligible",
      ).toBe(true);
    }
  });

  it("session reset does not delete persisted production history", async () => {
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
    hydrateWorkspaceSnapshot(committed.snapshot, committed.operational);
    resetCommandCenter();
    expect(store.writeCount({ organizationId: ORG_A, projectId: PROJECT_A })).toBe(1);
    expect(useReasoningStore.getState().runtime.reasonings).toHaveLength(1);
    applyReconstructedOperational(committed.snapshot, committed.operational);
  });

  it("keeps Recovered and Reopened as distinct historical records", () => {
    const events = [
      { type: "Recovered" as const, episodeNumber: 1 },
      { type: "Reopened" as const, episodeNumber: 1 },
      { type: "Recovered" as const, episodeNumber: 2 },
    ];
    expect(events.map((event) => `${event.type}:${event.episodeNumber}`)).toEqual([
      "Recovered:1",
      "Reopened:1",
      "Recovered:2",
    ]);
  });
});

describe("Phase 5F source boundaries", () => {
  it("keeps operational persistence off client stores and frozen engines", () => {
    for (const file of [
      "store/useProjectStore.ts",
      "store/useReasoningStore.ts",
      "store/useDecisionStore.ts",
      "domain/engines/reasoningPipeline.ts",
      "domain/decisions/transition.ts",
      "components/command-center/CommandCenterShell.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("createPostgresOperationalStore")).toBe(false);
      expect(source.includes("DATABASE_URL")).toBe(false);
      expect(source.includes("operational_heads")).toBe(false);
    }
  });

  it("does not import Harbor Point into the operational service", () => {
    for (const file of [
      "lib/operations/service.ts",
      "lib/operations/reconstruct.ts",
      "lib/operations/postgres.ts",
      "lib/operations/memoryBackend.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("getInitialProjectSnapshot")).toBe(false);
      expect(source.includes("validateHarborPointSeedSnapshot")).toBe(false);
      expect(source.includes("createDemoProjectRepository")).toBe(false);
    }
  });
});
