import { and, asc, eq } from "drizzle-orm";

import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type {
  FsmCommandEnvelope,
  OperationalBundle,
  PersistedCommand,
  PersistedObservation,
} from "@/domain/operations/types";
import type { SignalType, ScenarioFixtureSourceType } from "@/domain/types/signal";
import {
  operationalCommands,
  operationalDecisionTransitions,
  operationalDecisions,
  operationalEffectApplications,
  operationalEffects,
  operationalHeads,
  operationalObservations,
  operationalReasonings,
  operationalRecommendations,
  operationalRecoveryEvents,
  operationalScoreSnapshots,
  operationalTimelineEvents,
} from "@/drizzle/schema/operations";
import type { Database } from "@/lib/db/client";
import {
  makeApplicationId,
  makeScoreSnapshotId,
  makeTransitionId,
} from "@/lib/operations/ids";
import type {
  OperationalStore,
  OperationalTransaction,
  OperationalWrites,
} from "@/lib/operations/ports";
import { emptyOperationalBundle } from "@/lib/operations/reconstruct";
import { presentationScores } from "@/lib/selectors/recoveryPresentationSelectors";

type Session = Pick<Database, "select" | "insert" | "update" | "transaction">;

export function createPostgresOperationalStore(db: Database): OperationalStore {
  return {
    async transact(scope, run) {
      try {
        return await db.transaction(async (tx) => {
          const session = tx as unknown as Session;
          const [locked] = await session
            .select()
            .from(operationalHeads)
            .where(
              and(
                eq(operationalHeads.projectId, scope.projectId),
                eq(operationalHeads.organizationId, scope.organizationId),
              ),
            )
            .limit(1)
            .for("update");

          const txApi: OperationalTransaction = {
            loadBundle: () => loadBundle(session, scope, locked ?? null),
            findCommandByIdempotencyKey: async (idempotencyKey) => {
              const [row] = await session
                .select()
                .from(operationalCommands)
                .where(
                  and(
                    eq(operationalCommands.projectId, scope.projectId),
                    eq(operationalCommands.organizationId, scope.organizationId),
                    eq(operationalCommands.idempotencyKey, idempotencyKey),
                  ),
                )
                .limit(1);
              return row ? mapCommand(row) : null;
            },
            commit: async (writes) => {
              if (
                writes.head.organizationId !== scope.organizationId ||
                writes.head.projectId !== scope.projectId
              ) {
                throw new Error("tenant scope mismatch");
              }
              const currentVersion = locked?.workflowVersion ?? 0;
              if (writes.head.workflowVersion !== currentVersion + 1) {
                const error = new Error("workflow version conflict");
                error.name = "PersistenceConflict";
                throw error;
              }
              await persistWrites(session, writes, Boolean(locked));
            },
          };
          return run(txApi);
        });
      } catch (error) {
        if (error instanceof Error && error.name === "PersistenceConflict") {
          throw error;
        }
        throw error;
      }
    },
  };
}

async function loadBundle(
  session: Session,
  scope: { organizationId: string; projectId: string },
  head: typeof operationalHeads.$inferSelect | null,
): Promise<OperationalBundle> {
  if (!head) {
    return emptyOperationalBundle({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      replayBaselineAt: "1970-01-01T00:00:00.000Z",
    });
  }

  const observationRows = await session
    .select()
    .from(operationalObservations)
    .where(
      and(
        eq(operationalObservations.projectId, scope.projectId),
        eq(operationalObservations.organizationId, scope.organizationId),
      ),
    )
    .orderBy(asc(operationalObservations.sequenceOrder));

  const commandRows = await session
    .select()
    .from(operationalCommands)
    .where(
      and(
        eq(operationalCommands.projectId, scope.projectId),
        eq(operationalCommands.organizationId, scope.organizationId),
      ),
    )
    .orderBy(asc(operationalCommands.seq));

  const recoveryRows = await session
    .select()
    .from(operationalRecoveryEvents)
    .where(
      and(
        eq(operationalRecoveryEvents.projectId, scope.projectId),
        eq(operationalRecoveryEvents.organizationId, scope.organizationId),
      ),
    );

  return {
    organizationId: head.organizationId,
    projectId: head.projectId,
    workflowVersion: head.workflowVersion,
    commandSeq: head.commandSeq,
    replayBaselineAt: toIso(head.replayBaselineAt),
    currentlyRecoveredIssueIds: head.currentlyRecoveredIssueIds,
    observations: observationRows.map(mapObservation),
    commands: commandRows.map(mapCommand),
    recoveryEvents: recoveryRows.map(mapRecovery),
  };
}

async function persistWrites(
  session: Session,
  writes: OperationalWrites,
  headExists: boolean,
): Promise<void> {
  const headValues = {
    projectId: writes.head.projectId,
    organizationId: writes.head.organizationId,
    workflowVersion: writes.head.workflowVersion,
    commandSeq: writes.head.commandSeq,
    replayBaselineAt: toDate(writes.head.replayBaselineAt),
    currentlyRecoveredIssueIds: [...writes.head.currentlyRecoveredIssueIds],
    updatedAt: toDate(writes.command.committedAt),
  };
  if (headExists) {
    await session
      .update(operationalHeads)
      .set(headValues)
      .where(
        and(
          eq(operationalHeads.projectId, writes.head.projectId),
          eq(operationalHeads.organizationId, writes.head.organizationId),
        ),
      );
  } else {
    await session.insert(operationalHeads).values(headValues);
  }

  if (writes.observation) {
    await session.insert(operationalObservations).values({
      id: writes.observation.id,
      organizationId: writes.observation.organizationId,
      projectId: writes.observation.projectId,
      sequenceOrder: writes.observation.sequenceOrder,
      signalType: writes.observation.signalType,
      title: writes.observation.title,
      description: writes.observation.description,
      sourceType: writes.observation.sourceType,
      relatedEntityType: writes.observation.relatedEntityType,
      relatedEntityId: writes.observation.relatedEntityId,
      relatedTaskId: writes.observation.relatedTaskId,
      payload: writes.observation.payload,
      evidenceIds: [...writes.observation.evidenceIds],
      committedAt: toDate(writes.observation.committedAt),
      actorUserId: writes.observation.actorUserId,
      provenance: writes.observation.provenance,
      idempotencyKey: writes.observation.idempotencyKey,
      createdAt: toDate(writes.observation.committedAt),
    });
  }

  await session.insert(operationalCommands).values({
    id: writes.command.id,
    organizationId: writes.command.organizationId,
    projectId: writes.command.projectId,
    seq: writes.command.seq,
    kind: writes.command.kind,
    observationId: writes.command.observationId,
    decisionId: writes.command.decisionId,
    actorUserId: writes.command.actorUserId,
    committedAt: toDate(writes.command.committedAt),
    idempotencyKey: writes.command.idempotencyKey,
    fsmCommands: writes.command.fsmCommands,
    createdAt: toDate(writes.command.committedAt),
  });

  await persistAudit(session, writes);
}

async function persistAudit(
  session: Session,
  writes: OperationalWrites,
): Promise<void> {
  const { operational, command } = writes;
  const org = writes.head.organizationId;
  const projectId = writes.head.projectId;

  for (const entry of operational.reasoning.reasonings) {
    const observationId =
      command.observationId ??
      entry.signal.originFixtureId;
    await session
      .insert(operationalReasonings)
      .values({
        id: entry.signal.id,
        organizationId: org,
        projectId,
        observationId,
        signalId: entry.signal.id,
        issueId: entry.issue?.id ?? null,
        recommendationId: entry.recommendation?.id ?? null,
        commandId: command.id,
        analysisPayload: {
          dependency: entry.dependency,
          priority: entry.priority,
          prediction: entry.prediction,
        },
        createdAt: toDate(command.committedAt),
      })
      .onConflictDoNothing();
    if (entry.recommendation) {
      await session
        .insert(operationalRecommendations)
        .values({
          id: entry.recommendation.id,
          organizationId: org,
          projectId,
          signalId: entry.recommendation.signalId,
          issueId: entry.recommendation.issueId,
          commandId: command.id,
          primaryAction: entry.recommendation.primaryAction,
          approvalRequired: entry.recommendation.approval.required,
          payload: entry.recommendation,
          createdAt: toDate(command.committedAt),
        })
        .onConflictDoNothing();
    }
  }

  for (const decision of operational.decisions.decisions) {
    await session
      .insert(operationalDecisions)
      .values({
        id: decision.id,
        organizationId: org,
        projectId,
        recommendationId: decision.recommendationId,
        signalId: decision.signalId,
        issueId: decision.issueId,
        state: decision.state,
        actorUserId: command.kind === "decision_transition" ? command.actorUserId : null,
        selectedAction: decision.selectedAction,
        selectedActionSource: decision.selectedActionSource,
        mutatesOperationalState: decision.mutatesOperationalState,
        approvalRequired: decision.approvalRequired,
        createdAtSimulated: toDate(decision.createdAtSimulated),
        updatedAtSimulated: toDate(decision.updatedAtSimulated),
        auditTrail: decision.auditTrail,
        updatedAt: toDate(command.committedAt),
      })
      .onConflictDoUpdate({
        target: operationalDecisions.id,
        set: {
          state: decision.state,
          actorUserId:
            command.kind === "decision_transition"
              ? command.actorUserId
              : decision.auditTrail.at(-1)
                ? command.actorUserId
                : null,
          selectedAction: decision.selectedAction,
          selectedActionSource: decision.selectedActionSource,
          updatedAtSimulated: toDate(decision.updatedAtSimulated),
          auditTrail: decision.auditTrail,
          updatedAt: toDate(command.committedAt),
        },
      });
  }

  if (command.kind === "decision_transition") {
    const decision = operational.decisions.decisions.find(
      (item) => item.id === command.decisionId,
    );
    const events = decision?.auditTrail.slice(-command.fsmCommands.length) ?? [];
    for (const [index, event] of events.entries()) {
      await session.insert(operationalDecisionTransitions).values({
        id: makeTransitionId({
          commandId: command.id,
          commandType: event.command,
          index,
        }),
        organizationId: org,
        projectId,
        decisionId: event.decisionId,
        commandId: command.id,
        commandType: event.command,
        fromState: event.fromState,
        toState: event.toState,
        actorUserId: command.actorUserId,
        committedAt: toDate(event.simulatedAt),
        reason: event.reason,
        notes: event.notes,
        createdAt: toDate(command.committedAt),
      });
    }
  }

  for (const [index, effect] of operational.overlay.effectHistory.entries()) {
    await session
      .insert(operationalEffects)
      .values({
        id: effect.id,
        organizationId: org,
        projectId,
        commandId: command.id,
        effectType: effect.effectType,
        source: "source" in effect ? effect.source : "decision",
        sourceId:
          "decisionId" in effect && effect.decisionId
            ? effect.decisionId
            : effect.signalId,
        signalId: effect.signalId,
        decisionId: "decisionId" in effect ? effect.decisionId : null,
        simulatedAt: toDate(effect.simulatedAt),
        body: effect,
        createdAt: toDate(command.committedAt),
      })
      .onConflictDoNothing();
    const application = operational.overlay.applicationResults[index];
    if (application) {
      await session
        .insert(operationalEffectApplications)
        .values({
          id: makeApplicationId({ commandId: command.id, effectId: effect.id }),
          organizationId: org,
          projectId,
          effectId: effect.id,
          commandId: command.id,
          outcome: application.outcome,
          result: application,
          createdAt: toDate(command.committedAt),
        })
        .onConflictDoNothing();
    }
  }

  for (const event of writes.recoveryEvents) {
    await session
      .insert(operationalRecoveryEvents)
      .values({
        id: event.id,
        organizationId: org,
        projectId,
        commandId: command.id,
        issueId: event.issueId,
        signalId: event.signalId,
        verificationRuleId: event.verificationRuleId,
        episodeNumber: event.episodeNumber,
        type: event.type,
        simulatedAt: toDate(event.simulatedAt),
        relatedEntityType: event.relatedEntityType,
        relatedEntityId: event.relatedEntityId,
        taskId: event.taskId,
        sourceEffectIds: [...event.sourceEffectIds],
        evidence: event.evidence,
        createdAt: toDate(command.committedAt),
      })
      .onConflictDoNothing();
  }

  for (const event of operational.reasoning.timeline) {
    await session
      .insert(operationalTimelineEvents)
      .values({
        id: event.id,
        organizationId: org,
        projectId,
        commandId: command.id,
        kind: event.kind,
        signalId: event.signalId,
        sequenceOrder: event.sequenceOrder,
        summary: event.summary,
        facts: [...event.facts],
        committedAtSimulated: toDate(event.committedAtSimulated),
        createdAt: toDate(command.committedAt),
      })
      .onConflictDoNothing();
  }

  const scores = presentationScores(
    operational.reasoning,
    operational.recovery,
  );
  await session.insert(operationalScoreSnapshots).values({
    id: makeScoreSnapshotId(command.id),
    organizationId: org,
    projectId,
    commandId: command.id,
    healthScore: scores.health.score,
    driftScore: scores.drift.score,
    payload: {
      historical: true,
      health: scores.health,
      drift: scores.drift,
    },
    createdAt: toDate(command.committedAt),
  });
}

function mapObservation(
  row: typeof operationalObservations.$inferSelect,
): PersistedObservation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    sequenceOrder: row.sequenceOrder,
    signalType: row.signalType as SignalType,
    title: row.title,
    description: row.description,
    sourceType: row.sourceType as ScenarioFixtureSourceType,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    relatedTaskId: row.relatedTaskId,
    payload: row.payload,
    evidenceIds: row.evidenceIds,
    committedAt: toIso(row.committedAt),
    actorUserId: row.actorUserId,
    provenance: row.provenance,
    idempotencyKey: row.idempotencyKey,
  };
}

function mapCommand(row: typeof operationalCommands.$inferSelect): PersistedCommand {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    seq: row.seq,
    kind: row.kind,
    observationId: row.observationId,
    decisionId: row.decisionId,
    actorUserId: row.actorUserId,
    committedAt: toIso(row.committedAt),
    idempotencyKey: row.idempotencyKey,
    fsmCommands: row.fsmCommands as FsmCommandEnvelope[],
  };
}

function mapRecovery(
  row: typeof operationalRecoveryEvents.$inferSelect,
): IssueRecoveryHistoryEvent {
  return {
    id: row.id,
    issueId: row.issueId,
    signalId: row.signalId,
    verificationRuleId: row.verificationRuleId as IssueRecoveryHistoryEvent["verificationRuleId"],
    episodeNumber: row.episodeNumber,
    type: row.type,
    simulatedAt: toIso(row.simulatedAt),
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    taskId: row.taskId,
    sourceEffectIds: row.sourceEffectIds,
    evidence: row.evidence as IssueRecoveryHistoryEvent["evidence"],
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDate(value: string): Date {
  return new Date(value);
}
