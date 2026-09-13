import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import { publicAuthorizationMessage } from "@/domain/authorization/types";
import { publicOperationalMessage } from "@/domain/operations/publicErrors";
import { initialDecisionRuntime } from "@/domain/decisions/runtime";
import { initialOverlayRuntime } from "@/domain/effects/runtime";
import { initialRuntime } from "@/domain/engines/reasoningPipeline";
import { initialRecoveryRuntime } from "@/domain/recovery/runtime";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import { authorizeProjectCreateRequest } from "@/lib/auth/authorize";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { createFixedClock } from "@/lib/import/clock";
import {
  confirmImportJob,
  createParsedImportJob,
} from "@/lib/import/service";
import {
  commitProductionDecision,
  commitProductionObservation,
  loadOperationalWorkspace,
} from "@/lib/operations/service";
import { createPostgresOperationalStore } from "@/lib/operations/postgres";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { createPostgresProjectWorldSource } from "@/lib/repositories/postgresProjectWorldSource";
import { selectProjectRepository } from "@/lib/repositories/selectProjectRepository";
import { createDemoProjectRepository } from "@/lib/repositories/demoProjectRepository";
import { HARBOR_POINT_OPERATIONAL_AT } from "@/tests/repositories/recordsFactory";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import { presentationScores } from "@/lib/selectors/recoveryPresentationSelectors";
import { evaluateVoiceEligibility } from "@/lib/voice/eligibility";
import { loadProductionWorkspace } from "@/lib/workspace/loadWorkspace";
import { listAuthorizedWorkspaceProjects } from "@/lib/workspace/listProjects";
import { ensureCommandCenterInitialized } from "@/lib/orchestration/commandCenter";
import { useProjectStore } from "@/store/useProjectStore";
import { IMPORT_CLOCK, sheetsToCsv, VALID_SETUP, validSheets } from "@/tests/import/fixtures";
import * as schema from "@/drizzle/schema";
import type { Database } from "@/lib/db/client";
import type { ReconstructedOperationalState } from "@/domain/operations/types";

import {
  liveDatabaseUnavailableMessage,
  readLiveDatabaseConfig,
} from "@/tests/integration/postgres/liveEnv";
import {
  CLOCK_1,
  CLOCK_2,
  CLOCK_3,
  countScopedRows,
  createLiveDb,
  createLiveSql,
  delayObservation,
  deliveryObservation,
  identity,
  openLiveHarness,
  taskCompleteObservation,
  weatherObservation,
  type LiveHarness,
} from "@/tests/integration/postgres/harness";

const live = readLiveDatabaseConfig();

const EXPECTED_TABLES = [
  "auth_accounts",
  "auth_sessions",
  "auth_verification_tokens",
  "crews",
  "equipment",
  "evidence_items",
  "inspections",
  "materials",
  "operational_commands",
  "operational_decision_transitions",
  "operational_decisions",
  "operational_effect_applications",
  "operational_effects",
  "operational_heads",
  "operational_observations",
  "operational_reasonings",
  "operational_recommendations",
  "operational_recovery_events",
  "operational_score_snapshots",
  "operational_timeline_events",
  "organization_memberships",
  "organizations",
  "permits",
  "phases",
  "project_import_jobs",
  "project_memberships",
  "projects",
  "task_dependencies",
  "task_required_crews",
  "task_required_equipment",
  "task_required_materials",
  "tasks",
  "users",
  "weather_event_affected_task_types",
  "weather_events",
];

const EXPECTED_ENUMS = [
  "crew_status",
  "delivery_status",
  "equipment_status",
  "evidence_source_type",
  "import_file_type",
  "import_job_status",
  "inspection_status",
  "operational_command_kind",
  "operational_decision_command_type",
  "operational_decision_state",
  "operational_effect_application_outcome",
  "operational_fixture_source_type",
  "operational_recovery_event_type",
  "operational_signal_type",
  "organization_role",
  "permit_status",
  "phase_status",
  "project_status",
  "task_state",
  "task_type",
  "weather_severity",
];

const EXPECTED_UNIQUES = [
  "projects_id_organization_id_unique",
  "operational_heads_project_organization_unique",
  "operational_observations_project_idempotency_unique",
  "operational_commands_project_idempotency_unique",
  "operational_commands_project_seq_unique",
];

const EXPECTED_INDEXES = [
  "projects_organization_id_idx",
  "operational_heads_organization_id_idx",
  "operational_observations_project_org_idx",
  "operational_commands_project_org_idx",
];

function operationalDigest(operational: ReconstructedOperationalState) {
  const scores = presentationScores(operational.reasoning, operational.recovery);
  return {
    reasoning: operational.reasoning.reasonings.map((entry) => ({
      signalId: entry.signal.id,
      type: entry.signal.type,
      recommendationId: entry.recommendation?.id ?? null,
    })),
    decisions: operational.decisions.decisions.map((decision) => ({
      id: decision.id,
      state: decision.state,
      recommendationId: decision.recommendationId,
    })),
    effects: operational.overlay.effectHistory.map((effect) => effect.id).sort(),
    applications: operational.overlay.applicationResults
      .map((result) => ({
        effectId: "effectId" in result ? String(result.effectId ?? "") : "",
        outcome: result.outcome,
      }))
      .sort((a, b) => a.effectId.localeCompare(b.effectId)),
    effectiveTasks: operational.overlay.effective.snapshot.tasks
      .map((task) => ({ id: task.id, status: task.status }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    recoveryHistory: operational.recovery.history.map((event) => ({
      type: event.type,
      episodeNumber: event.episodeNumber,
      issueId: event.issueId,
    })),
    currentlyRecovered: [...operational.recovery.currentlyRecoveredIssueIds].sort(),
    health: scores.health.score,
    drift: scores.drift.score,
    timeline: operational.reasoning.timeline.map((event) => event.sequenceOrder),
  };
}

describe("Phase 5G live environment detection", () => {
  it("detects required environment variables without exposing values", () => {
    expect(live === null || live.databaseUrlStatus === "SET").toBe(true);
    if (!live) {
      expect(liveDatabaseUnavailableMessage()).toContain("DATABASE_URL NOT CONFIGURED");
      return;
    }
    expect(live.envFileExists).toBe(true);
    expect(live.databaseUrlStatus).toBe("SET");
    expect(live.runtimeModeStatus).toBe("SET");
    expect(live.runtimeMode).toBe("production");
  });
});

describe.skipIf(!live)("Phase 5G live PostgreSQL production gate", () => {
  let harness: LiveHarness;
  const timings: Record<string, number> = {};

  beforeAll(async () => {
    harness = await openLiveHarness(live!.databaseUrl);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  }, 60_000);

  it("verifies approved schema objects on the live database", async () => {
    const tables = await harness.sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
    const tableNames = tables.map((row) => row.table_name);
    for (const name of EXPECTED_TABLES) {
      expect(tableNames).toContain(name);
    }

    const enums = await harness.sql<{ typname: string }[]>`
      select t.typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
      order by t.typname
    `;
    const enumNames = enums.map((row) => row.typname);
    for (const name of EXPECTED_ENUMS) {
      expect(enumNames).toContain(name);
    }

    const uniques = await harness.sql<{ conname: string }[]>`
      select conname from pg_constraint where contype = 'u'
    `;
    const uniqueNames = uniques.map((row) => row.conname);
    for (const name of EXPECTED_UNIQUES) {
      expect(uniqueNames).toContain(name);
    }

    const indexes = await harness.sql<{ indexname: string }[]>`
      select indexname from pg_indexes where schemaname = 'public'
    `;
    const indexNames = indexes.map((row) => row.indexname);
    for (const name of EXPECTED_INDEXES) {
      expect(indexNames).toContain(name);
    }

    const fks = await harness.sql<{ n: number }[]>`
      select count(*)::int as n
      from pg_constraint
      where contype = 'f'
        and conname in (
          'projects_organization_id_fk',
          'operational_heads_project_org_fk',
          'operational_observations_project_org_fk',
          'operational_commands_project_org_fk'
        )
    `;
    expect((fks[0]?.n ?? 0) >= 4).toBe(true);

    const drizzleRows = await harness.sql<{ id: number }[]>`
      select id from drizzle.__drizzle_migrations
    `;
    expect(drizzleRows.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves live identity, owner access, and cross-tenant denial", async () => {
    const owner = await harness.directory.findUserById(harness.ownerA);
    expect(owner?.id).toBe(harness.ownerA);
    const memberships = await harness.directory.listOrganizationMemberships(
      harness.ownerA,
    );
    expect(memberships.map((item) => item.organizationId)).toEqual([harness.orgA]);

    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      directory: harness.directory,
      catalog: harness.catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.some((project) => project.id === harness.projectA)).toBe(
      true,
    );

    const cross = await loadProductionWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectB,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(
      cross.status === "ProjectNotFound" || cross.status === "ProjectAccessDenied",
    ).toBe(true);
    expect(publicAuthorizationMessage({ status: "ProjectNotFound" })).toBe(
      publicAuthorizationMessage({ status: "ProjectAccessDenied" }),
    );
  });

  it("loads the persisted customer project through ProjectRepository", async () => {
    const started = Date.now();
    const loaded = await harness.repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: harness.orgA,
        actorUserId: harness.ownerA,
      },
      projectId: harness.projectA,
      currentOperationalAt: CLOCK_1,
    });
    timings.snapshotLoadMs = Date.now() - started;
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    expect(loaded.snapshot.project.id).toBe(harness.projectA);
    expect(loaded.snapshot.project.timezone).toBe("America/Chicago");
    expect(loaded.snapshot.project.currentPhaseId).toBe("phase-structure");
    expect(loaded.snapshot.project.currentSimulatedAt).toBe(CLOCK_1);
    expect(loaded.snapshot.phases).toHaveLength(1);
    expect(loaded.snapshot.tasks.map((task) => task.id).sort()).toEqual([
      "task-foundation",
      "task-pour",
    ]);
    expect(loaded.snapshot.tasks.find((task) => task.id === "task-pour")?.dependencyTaskIds).toEqual([
      "task-foundation",
    ]);
    expect(loaded.snapshot.crews).toHaveLength(1);
    expect(loaded.snapshot.materials).toHaveLength(1);
    expect(loaded.snapshot.equipment).toHaveLength(1);
    expect(loaded.snapshot.inspections).toHaveLength(1);
    expect(loaded.snapshot.permits).toHaveLength(1);
    expect(loaded.snapshot.weather).toHaveLength(1);
    expect(loaded.snapshot.evidence.length).toBeGreaterThan(0);
    expect(loaded.snapshot.scenarioFixtures).toEqual([]);
    expect(validateProjectSnapshot(loaded.snapshot).ok).toBe(true);
    expect(loaded.snapshot.project.id).not.toBe("proj-harbor-point");
    expect(validateHarborPointSeedSnapshot(loaded.snapshot).ok).toBe(false);
  });

  it("confirms a CSV import against PostgreSQL and is idempotent", async () => {
    const authorization = await authorizeProjectCreateRequest({
      identity: identity(harness.ownerA),
      organizationId: harness.orgA,
      directory: harness.directory,
    });
    expect(authorization.status).toBe("Authorized");
    const denied = await authorizeProjectCreateRequest({
      identity: identity(harness.viewerA),
      organizationId: harness.orgA,
      directory: harness.directory,
    });
    expect(denied.status).toBe("CapabilityDenied");

    const created = await createParsedImportJob({
      authorization,
      setup: VALID_SETUP,
      filename: "pulsebuild-live.csv",
      bytes: new TextEncoder().encode(sheetsToCsv(validSheets())),
      clock: createFixedClock(IMPORT_CLOCK),
      store: harness.importStore,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    expect(created.job.status === "ReadyToImport" || created.job.status === "NeedsReview").toBe(
      true,
    );

    const first = await confirmImportJob({
      authorization,
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock: createFixedClock(IMPORT_CLOCK),
      store: harness.importStore,
      persistence: harness.importPersistence,
    });
    expect(first.status).toBe("Imported");
    if (first.status !== "Imported") return;

    const reloaded = await harness.repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: harness.orgA,
        actorUserId: harness.ownerA,
      },
      projectId: first.projectId,
      currentOperationalAt: CLOCK_1,
    });
    expect(reloaded.status).toBe("Loaded");
    if (reloaded.status !== "Loaded") return;
    expect(validateProjectSnapshot(reloaded.snapshot).ok).toBe(true);
    expect(reloaded.snapshot.scenarioFixtures).toEqual([]);

    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      directory: harness.directory,
      catalog: harness.catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status === "Listed") {
      expect(listed.projects.some((project) => project.id === first.projectId)).toBe(
        true,
      );
    }

    const second = await confirmImportJob({
      authorization,
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock: createFixedClock(IMPORT_CLOCK),
      store: harness.importStore,
      persistence: harness.importPersistence,
    });
    expect(second.status).toBe("AlreadyImported");
    if (second.status === "AlreadyImported") {
      expect(second.projectId).toBe(first.projectId);
    }
  });

  it("commits an authorized observation through the live operational service", async () => {
    const before = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    const started = Date.now();
    const committed = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: weatherObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    timings.observationCommitMs = Date.now() - started;
    expect(committed.status).toBe("Committed");
    if (committed.status !== "Committed") return;
    expect(committed.operational.reasoning.reasonings).toHaveLength(1);
    expect(committed.operational.decisions.decisions.length).toBeGreaterThan(0);

    const after = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(after.observations).toBe(before.observations + 1);
    expect(after.commands).toBe(before.commands + 1);
    expect(after.heads).toBe(1);

    const [row] = await harness.sql<{ actor_user_id: string }[]>`
      select actor_user_id from operational_observations
      where organization_id = ${harness.orgA} and project_id = ${harness.projectA}
      order by sequence_order desc
      limit 1
    `;
    expect(row?.actor_user_id).toBe(harness.ownerA);
  });

  it("persists a valid FSM transition and rejects an invalid one with zero writes", async () => {
    const loaded = await loadOperationalWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    const decision = loaded.operational.decisions.decisions[0];
    expect(decision).toBeDefined();
    if (!decision) return;
    const requiresApproval =
      loaded.operational.reasoning.reasonings[0]?.recommendation?.approval.required;
    const before = await countScopedRows(harness.sql, harness.orgA, harness.projectA);

    const invalid = await commitProductionDecision({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      decision: { decisionId: decision.id, commands: [{ type: "VerifyDecision" }] },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(invalid.status).toBe("InvalidTransition");
    expect(publicOperationalMessage("InvalidTransition")).not.toMatch(/sql|postgres|relation/i);
    const afterInvalid = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(afterInvalid.commands).toBe(before.commands);
    expect(afterInvalid.transitions).toBe(before.transitions);

    const approved = await commitProductionDecision({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      decision: {
        decisionId: decision.id,
        commands: requiresApproval
          ? [
              { type: "ApproveDecision", selectedActionSource: "primary" },
              { type: "ProceedAfterApproval" },
            ]
          : [{ type: "AcknowledgeDecision" }],
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(approved.status).toBe("Committed");
    if (approved.status !== "Committed") return;
    const after = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(after.commands).toBe(before.commands + 1);
    expect(after.transitions).toBeGreaterThan(before.transitions);
    const [transition] = await harness.sql<{ actor_user_id: string }[]>`
      select actor_user_id from operational_decision_transitions
      where organization_id = ${harness.orgA} and project_id = ${harness.projectA}
      order by created_at desc
      limit 1
    `;
    expect(transition?.actor_user_id).toBe(harness.ownerA);
    const [head] = await harness.sql<{ workflow_version: number }[]>`
      select workflow_version from operational_heads
      where organization_id = ${harness.orgA} and project_id = ${harness.projectA}
    `;
    expect(head?.workflow_version).toBe(approved.operational.workflowVersion);
  });

  it("persists applied and rejected effects from the frozen engines", async () => {
    const first = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: taskCompleteObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_2),
    });
    expect(first.status).toBe("Committed");
    const second = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: taskCompleteObservation({ attempt: 2 }),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_3),
    });
    expect(second.status).toBe("Committed");
    if (second.status !== "Committed") return;
    expect(
      second.operational.overlay.applicationResults.some(
        (result) => result.outcome === "Rejected" || result.outcome === "AlreadyApplied",
      ),
    ).toBe(true);
    expect(
      second.operational.overlay.effective.snapshot.tasks.find(
        (task) => task.id === "task-pour",
      )?.status,
    ).toBe("Completed");
    const rows = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(rows.effects).toBeGreaterThan(0);
    expect(rows.applications).toBeGreaterThan(0);
  });

  it("persists Recovered history from the frozen recovery path", async () => {
    const delayed = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: delayObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_3),
    });
    expect(delayed.status).toBe("Committed");
    const received = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: deliveryObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock("2026-09-08T18:00:00.000Z"),
    });
    expect(received.status).toBe("Committed");
    if (received.status !== "Committed") return;
    expect(
      received.operational.recovery.history.some((event) => event.type === "Recovered"),
    ).toBe(true);
    expect(
      received.operational.recovery.history.some((event) => event.type === "Reopened"),
    ).toBe(false);
    const rows = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(rows.recovery).toBeGreaterThan(0);
  });

  it("rolls back a multi-record operational commit on a controlled failure", async () => {
    const snapshotLoad = await harness.repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: harness.orgA,
        actorUserId: harness.ownerA,
      },
      projectId: harness.projectA,
      currentOperationalAt: CLOCK_1,
    });
    expect(snapshotLoad.status).toBe("Loaded");
    if (snapshotLoad.status !== "Loaded") return;
    const before = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    const [currentHead] = await harness.sql<{ workflow_version: number }[]>`
      select workflow_version from operational_heads
      where organization_id = ${harness.orgA} and project_id = ${harness.projectA}
    `;
    const nextVersion = (currentHead?.workflow_version ?? 0) + 1;
    const missingActor = `${harness.ownerA}-missing`;
    await expect(
      harness.store.transact(
        { organizationId: harness.orgA, projectId: harness.projectA },
        async (tx) => {
          await tx.commit({
            head: {
              organizationId: harness.orgA,
              projectId: harness.projectA,
              workflowVersion: nextVersion,
              commandSeq: before.commands + 10,
              replayBaselineAt: "2026-01-01T00:00:00.000Z",
              currentlyRecoveredIssueIds: [],
            },
            observation: {
              id: `obs_5g_rollback_${harness.runId}`,
              organizationId: harness.orgA,
              projectId: harness.projectA,
              sequenceOrder: before.observations + 10,
              signalType: "WeatherAlert",
              title: "rollback",
              description: "controlled failure",
              sourceType: "user",
              relatedEntityType: "weather",
              relatedEntityId: "wx-clear",
              relatedTaskId: "task-pour",
              payload: {},
              evidenceIds: [],
              committedAt: CLOCK_1,
              actorUserId: harness.ownerA,
              provenance: "user",
              idempotencyKey: "rollback-key",
            },
            command: {
              id: `ocmd_5g_rollback_${harness.runId}`,
              organizationId: harness.orgA,
              projectId: harness.projectA,
              seq: before.commands + 10,
              kind: "observation",
              observationId: `obs_5g_rollback_${harness.runId}`,
              decisionId: null,
              actorUserId: missingActor,
              committedAt: CLOCK_1,
              idempotencyKey: "rollback-key",
              fsmCommands: [],
            },
            recoveryEvents: [],
            operational: {
              reasoning: initialRuntime(),
              decisions: initialDecisionRuntime(),
              overlay: initialOverlayRuntime(snapshotLoad.snapshot),
              recovery: initialRecoveryRuntime(snapshotLoad.snapshot),
              workflowVersion: before.commands + 10,
              replayBaselineAt: "2026-01-01T00:00:00.000Z",
            },
          });
        },
      ),
    ).rejects.toBeTruthy();
    const after = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(after).toEqual(before);
    const leftover = await harness.sql<{ n: number }[]>`
      select count(*)::int as n from operational_observations
      where id = ${`obs_5g_rollback_${harness.runId}`}
    `;
    expect(leftover[0]?.n).toBe(0);
  });

  it("treats a duplicate live observation as AlreadyCommitted", async () => {
    const first = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: {
        ...weatherObservation(),
        title: "Duplicate wind",
        payload: { condition: "Wind", severity: "high", marker: "idem" },
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock("2026-09-08T19:00:00.000Z"),
    });
    const before = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    const second = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: {
        ...weatherObservation(),
        title: "Duplicate wind again",
        payload: { condition: "Wind", severity: "high", marker: "idem" },
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock("2026-09-08T19:30:00.000Z"),
    });
    expect(first.status).toBe("Committed");
    expect(second.status).toBe("AlreadyCommitted");
    const after = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(after.commands).toBe(before.commands);
    expect(after.observations).toBe(before.observations);
    expect(after.effects).toBe(before.effects);
    expect(after.recovery).toBe(before.recovery);
  });

  it("handles concurrent live decision transitions without a lost update", async () => {
    const created = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: {
        signalType: "PermitPending",
        title: "Permit hold",
        description: "Pour permit pending city review.",
        relatedEntityType: "permit",
        relatedEntityId: "perm-pour",
        relatedTaskId: "task-pour",
        payload: { status: "pending" },
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock("2026-09-08T20:00:00.000Z"),
    });
    expect(created.status).toBe("Committed");
    if (created.status !== "Committed") return;
    const decision = created.operational.decisions.decisions.find(
      (item) => item.state === "PendingReview",
    );
    expect(decision).toBeDefined();
    if (!decision) return;
    const version = created.operational.workflowVersion;
    const requiresApproval =
      created.operational.reasoning.reasonings.at(-1)?.recommendation?.approval.required;
    const before = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    const results = await Promise.all([
      commitProductionDecision({
        identity: identity(harness.ownerA),
        requestedOrganizationId: harness.orgA,
        projectId: harness.projectA,
        decision: {
          decisionId: decision.id,
          expectedWorkflowVersion: version,
          commands: requiresApproval
            ? [
                { type: "ApproveDecision", selectedActionSource: "primary" },
                { type: "ProceedAfterApproval" },
              ]
            : [{ type: "AcknowledgeDecision" }],
        },
        directory: harness.directory,
        repository: harness.repository,
        store: harness.store,
        clock: createFixedClock("2026-09-08T20:15:00.000Z"),
      }),
      commitProductionDecision({
        identity: identity(harness.ownerA),
        requestedOrganizationId: harness.orgA,
        projectId: harness.projectA,
        decision: {
          decisionId: decision.id,
          expectedWorkflowVersion: version,
          commands: [{ type: "RejectDecision", reason: "Hold the pour" }],
        },
        directory: harness.directory,
        repository: harness.repository,
        store: harness.store,
        clock: createFixedClock("2026-09-08T20:15:00.000Z"),
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
    const after = await countScopedRows(harness.sql, harness.orgA, harness.projectA);
    expect(after.commands).toBe(before.commands + 1);
    const heads = await harness.sql<{ n: number; version: number }[]>`
      select count(*)::int as n, max(workflow_version)::int as version
      from operational_heads
      where organization_id = ${harness.orgA} and project_id = ${harness.projectA}
    `;
    expect(heads[0]?.n).toBe(1);
    expect(heads[0]?.version).toBe(version + 1);
  });

  it("reconstructs identical operational state from a fresh PostgreSQL connection", async () => {
    const started = Date.now();
    const before = await loadOperationalWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_3),
    });
    timings.historyLoadMs = Date.now() - started;
    expect(before.status).toBe("Loaded");
    if (before.status !== "Loaded") return;
    const expected = operationalDigest(before.operational);

    const freshSql = createLiveSql(live!.databaseUrl);
    const freshDb = createLiveDb(freshSql);
    const reconstructStarted = Date.now();
    const after = await loadOperationalWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      directory: harness.directory,
      repository: createProjectRepository(
        createPostgresProjectWorldSource(freshDb),
      ),
      store: createPostgresOperationalStore(freshDb),
      clock: createFixedClock(CLOCK_3),
    });
    timings.reconstructionMs = Date.now() - reconstructStarted;
    await freshSql.end({ timeout: 5 });
    expect(after.status).toBe("Loaded");
    if (after.status !== "Loaded") return;
    expect(operationalDigest(after.operational)).toEqual(expected);
    expect(after.snapshot.scenarioFixtures).toEqual([]);
    expect(after.snapshot.project.id).not.toBe("proj-harbor-point");
  });

  it("builds Command Center, AgentContext, and Voice policy from live reconstruction", async () => {
    const loaded = await loadProductionWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_3),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    expect(loaded.snapshot.scenarioFixtures).toEqual([]);
    expect(loaded.operational.reasoning.reasonings.length).toBeGreaterThan(0);

    const timeline = joinOperationalTimeline(
      loaded.operational.reasoning.timeline,
      loaded.operational.decisions.decisions,
      {
        effectHistory: loaded.operational.overlay.effectHistory,
        applicationResults: loaded.operational.overlay.applicationResults,
        recoveryHistory: loaded.operational.recovery.history,
      },
    );
    const context = buildAgentContext({
      reasoning: loaded.operational.reasoning,
      decisions: loaded.operational.decisions,
      overlay: loaded.operational.overlay,
      recovery: loaded.operational.recovery,
      evaluationSimulatedAt: CLOCK_3,
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

  it("rejects unauthorized, invalid, and nested cross-tenant mutations", async () => {
    const unauthorized = await commitProductionObservation({
      identity: identity(harness.viewerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: weatherObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(unauthorized.status).toBe("CapabilityDenied");

    const invalid = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: {
        ...weatherObservation(),
        title: "",
        relatedEntityId: "missing-entity",
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(invalid.status).toBe("InvalidObservation");

    const loaded = await loadOperationalWorkspace({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    const decisionId = loaded.operational.decisions.decisions[0]?.id;
    expect(decisionId).toBeDefined();
    const nested = await commitProductionDecision({
      identity: identity(harness.ownerB),
      requestedOrganizationId: harness.orgB,
      projectId: harness.projectB,
      decision: {
        decisionId: decisionId!,
        commands: [{ type: "RejectDecision", reason: "cross" }],
      },
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(
      nested.status === "ProjectNotFound" || nested.status === "ProjectAccessDenied",
    ).toBe(true);
  });

  it("fails closed on corrupted persisted history and unavailable connections", async () => {
    await harness.sql`
      insert into operational_commands (
        id, organization_id, project_id, seq, kind, observation_id, decision_id,
        actor_user_id, committed_at, idempotency_key, fsm_commands, created_at
      ) values (
        'ocmd_5g_corrupt',
        ${harness.orgB},
        ${harness.projectB},
        1,
        'observation',
        null,
        null,
        ${harness.ownerB},
        ${CLOCK_1},
        'corrupt-live',
        '[]'::jsonb,
        ${CLOCK_1}
      )
    `;
    await harness.sql`
      insert into operational_heads (
        project_id, organization_id, workflow_version, command_seq,
        replay_baseline_at, currently_recovered_issue_ids, updated_at
      ) values (
        ${harness.projectB},
        ${harness.orgB},
        1,
        1,
        ${"2026-01-01T00:00:00.000Z"},
        '[]'::jsonb,
        ${CLOCK_1}
      )
    `;
    const corrupted = await loadOperationalWorkspace({
      identity: identity(harness.ownerB),
      requestedOrganizationId: harness.orgB,
      projectId: harness.projectB,
      directory: harness.directory,
      repository: harness.repository,
      store: harness.store,
      clock: createFixedClock(CLOCK_1),
    });
    expect(corrupted.status).toBe("InvalidPersistedOperationalData");
    expect(publicOperationalMessage("InvalidPersistedOperationalData")).not.toMatch(
      /sql|postgres|relation|constraint/i,
    );

    const deadSql = postgres("postgresql://127.0.0.1:1/pulsebuild_unavailable", {
      max: 1,
      connect_timeout: 1,
    });
    const deadDb = drizzle(deadSql, { schema }) as unknown as Database;
    const unavailable = await commitProductionObservation({
      identity: identity(harness.ownerA),
      requestedOrganizationId: harness.orgA,
      projectId: harness.projectA,
      observation: weatherObservation(),
      directory: harness.directory,
      repository: harness.repository,
      store: createPostgresOperationalStore(deadDb),
      clock: createFixedClock(CLOCK_1),
    });
    await deadSql.end({ timeout: 1 }).catch(() => undefined);
    expect(unavailable.status).toBe("DatabaseUnavailable");
    expect(publicOperationalMessage("DatabaseUnavailable")).not.toMatch(
      /sql|postgres|ECONNREFUSED|127\.0\.0\.1/i,
    );
  });

  it("does not fall back to Harbor Point or memory when production ports are used", () => {
    expect(isProductionRuntime({ PULSEBUILD_RUNTIME_MODE: "production" })).toBe(true);
    expect(isProductionRuntime({ VITEST: "true" })).toBe(false);
    expect(selectProjectRepository({ PULSEBUILD_RUNTIME_MODE: "demo" })).toBeTruthy();
    expect(createDemoProjectRepository()).toBeTruthy();
    for (const file of [
      "lib/operations/postgres.ts",
      "lib/operations/service.ts",
      "lib/repositories/postgresProjectWorldSource.ts",
      "lib/workspace/productionPorts.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("getInitialProjectSnapshot")).toBe(false);
      expect(source.includes("MemoryOperationalStore")).toBe(false);
      expect(source.includes("createDemoProjectRepository")).toBe(false);
    }
  });

  it("keeps Harbor Point demo isolated from live PostgreSQL work", async () => {
    useProjectStore.getState().loadSeedProject();
    const snapshot = ensureCommandCenterInitialized();
    expect(snapshot.project.id).toBe("proj-harbor-point");
    expect(snapshot.scenarioFixtures).toHaveLength(5);
    expect(validateHarborPointSeedSnapshot(snapshot).ok).toBe(true);
    const demoLoaded = await createDemoProjectRepository().loadProjectSnapshot({
      tenantScope: {
        organizationId: "org-harbor-point",
        actorUserId: "demo",
      },
      projectId: "proj-harbor-point",
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(demoLoaded.status).toBe("Loaded");
  });

  it("records live performance sanity bounds without introducing cache", () => {
    expect(timings.snapshotLoadMs).toBeLessThan(15_000);
    expect(timings.observationCommitMs).toBeLessThan(20_000);
    expect(timings.historyLoadMs).toBeLessThan(20_000);
    expect(timings.reconstructionMs).toBeLessThan(20_000);
  });
});
