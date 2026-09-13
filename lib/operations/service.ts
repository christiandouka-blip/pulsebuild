import { isAuthorized } from "@/domain/authorization/types";
import type { AuthenticatedIdentity } from "@/domain/authorization/types";
import type { AuthorizationResult, AuthorizationStatus } from "@/domain/authorization/types";
import type { Capability } from "@/domain/authorization/capabilities";
import { getDecisionById } from "@/domain/decisions/runtime";
import {
  applyCommandsToDecision,
} from "@/domain/decisions/applyCommands";
import type {
  OperationalBundle,
  OperationalFailureStatus,
  PersistedCommand,
  PersistedObservation,
  ProductionDecisionInput,
  ProductionObservationInput,
  ReconstructedOperationalState,
} from "@/domain/operations/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { authorizeProjectRequest } from "@/lib/auth/authorize";
import type { IdentityDirectory } from "@/lib/auth/identityDirectory";
import type { InstantClock } from "@/lib/import/clock";
import type { ProjectRepository } from "@/lib/repositories/types";
import {
  capabilityForDecisionCommands,
  toDecisionCommand,
} from "@/lib/operations/decisionCommands";
import {
  makeCommandId,
  makeDecisionIdempotencyKey,
  makeObservationId,
  makeObservationIdempotencyKey,
} from "@/lib/operations/ids";
import type { OperationalStore } from "@/lib/operations/ports";
import {
  emptyOperationalBundle,
  reconstructOperationalWorkspace,
} from "@/lib/operations/reconstruct";
import {
  replayBaselineFromSnapshot,
  trialObservationIntake,
} from "@/lib/operations/replaySnapshot";
import { validateProductionObservation } from "@/lib/operations/validateObservation";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";

export type OperationalCommandSuccess = {
  status: "Committed" | "AlreadyCommitted";
  snapshot: ProjectSnapshot;
  operational: ReconstructedOperationalState;
  organizationId: string;
  projectId: string;
};

export type OperationalCommandResult =
  | OperationalCommandSuccess
  | Exclude<AuthorizationResult, { status: "Authorized" }>
  | { status: Exclude<OperationalFailureStatus, AuthorizationStatus> };

export async function loadOperationalWorkspace(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  projectId: string;
  directory: IdentityDirectory;
  repository: ProjectRepository;
  store: OperationalStore;
  clock: InstantClock;
}): Promise<
  | {
      status: "Loaded";
      snapshot: ProjectSnapshot;
      operational: ReconstructedOperationalState;
      organizationId: string;
      projectId: string;
      currentOperationalAt: string;
    }
  | { status: OperationalFailureStatus }
> {
  const authorized = await authorizeAndLoadSnapshot({
    ...input,
    capability: "project:view",
  });
  if (authorized.status !== "ready") return { status: authorized.status };

  try {
    return await input.store.transact(
      {
        organizationId: authorized.organizationId,
        projectId: input.projectId,
      },
      async (tx) => {
        const bundle = withBaseline(
          await tx.loadBundle(),
          authorized.snapshot,
          authorized.organizationId,
        );
        const reconstructed = reconstructOperationalWorkspace(
          authorized.snapshot,
          bundle,
        );
        if (reconstructed.status !== "Reconstructed") {
          return { status: reconstructed.status };
        }
        return {
          status: "Loaded" as const,
          snapshot: authorized.snapshot,
          operational: reconstructed.operational,
          organizationId: authorized.organizationId,
          projectId: input.projectId,
          currentOperationalAt: authorized.currentOperationalAt,
        };
      },
    );
  } catch {
    return { status: "DatabaseUnavailable" };
  }
}

export async function commitProductionObservation(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  projectId: string;
  observation: ProductionObservationInput;
  directory: IdentityDirectory;
  repository: ProjectRepository;
  store: OperationalStore;
  clock: InstantClock;
}): Promise<OperationalCommandResult> {
  const submit = await authorizeAndLoadSnapshot({
    ...input,
    capability: "observation:submit",
  });
  if (submit.status !== "ready") return { status: submit.status };
  const process = await authorizeAndLoadSnapshot({
    ...input,
    capability: "observation:process",
  });
  if (process.status !== "ready") return { status: process.status };

  const { snapshot, organizationId, currentOperationalAt } = process;
  const payload = input.observation.payload ?? {};
  const idempotencyKey =
    input.observation.idempotencyKey?.trim() ||
    makeObservationIdempotencyKey({
      organizationId,
      projectId: input.projectId,
      signalType: input.observation.signalType,
      relatedEntityType: input.observation.relatedEntityType,
      relatedEntityId: input.observation.relatedEntityId,
      relatedTaskId: input.observation.relatedTaskId,
      payload,
    });

  try {
    return await input.store.transact(
      { organizationId, projectId: input.projectId },
      async (tx) => {
        const existing = await tx.findCommandByIdempotencyKey(idempotencyKey);
        const loaded = withBaseline(
          await tx.loadBundle(),
          snapshot,
          organizationId,
        );
        if (existing) {
          const reconstructed = reconstructOperationalWorkspace(snapshot, loaded);
          if (reconstructed.status !== "Reconstructed") {
            return { status: reconstructed.status };
          }
          return {
            status: "AlreadyCommitted" as const,
            snapshot,
            operational: reconstructed.operational,
            organizationId,
            projectId: input.projectId,
          };
        }

        if (
          input.observation.expectedWorkflowVersion !== undefined &&
          input.observation.expectedWorkflowVersion !== loaded.workflowVersion
        ) {
          return { status: "PersistenceConflict" as const };
        }

        const validation = validateProductionObservation(
          snapshot,
          input.observation,
        );
        if (validation.length > 0) {
          return { status: "InvalidObservation" as const };
        }

        const observation: PersistedObservation = {
          id: makeObservationId({
            organizationId,
            projectId: input.projectId,
            idempotencyKey,
          }),
          organizationId,
          projectId: input.projectId,
          sequenceOrder: loaded.observations.length + 1,
          signalType: input.observation.signalType,
          title: input.observation.title.trim(),
          description: input.observation.description.trim(),
          sourceType: "user",
          relatedEntityType: input.observation.relatedEntityType.trim(),
          relatedEntityId: input.observation.relatedEntityId.trim(),
          relatedTaskId: input.observation.relatedTaskId.trim(),
          payload,
          evidenceIds: [...(input.observation.evidenceIds ?? [])],
          committedAt: currentOperationalAt,
          actorUserId: process.actorUserId,
          provenance: input.observation.provenance?.trim() || "user",
          idempotencyKey,
        };

        const trial = trialObservationIntake(
          snapshot,
          observation,
          loaded.observations,
          loaded.replayBaselineAt,
        );
        if (!trial.ok) {
          return { status: "InvalidObservation" as const };
        }

        const command: PersistedCommand = {
          id: makeCommandId({
            organizationId,
            projectId: input.projectId,
            idempotencyKey,
          }),
          organizationId,
          projectId: input.projectId,
          seq: loaded.commandSeq + 1,
          kind: "observation",
          observationId: observation.id,
          decisionId: null,
          actorUserId: process.actorUserId,
          committedAt: currentOperationalAt,
          idempotencyKey,
          fsmCommands: [],
        };

        const nextBundle: OperationalBundle = {
          ...loaded,
          workflowVersion: loaded.workflowVersion + 1,
          commandSeq: command.seq,
          observations: [...loaded.observations, observation],
          commands: [...loaded.commands, command],
        };
        const reconstructed = reconstructOperationalWorkspace(
          snapshot,
          nextBundle,
        );
        if (reconstructed.status !== "Reconstructed") {
          return { status: reconstructed.status };
        }

        await tx.commit({
          head: {
            organizationId,
            projectId: input.projectId,
            workflowVersion: nextBundle.workflowVersion,
            commandSeq: nextBundle.commandSeq,
            replayBaselineAt: nextBundle.replayBaselineAt,
            currentlyRecoveredIssueIds:
              reconstructed.operational.recovery.currentlyRecoveredIssueIds,
          },
          observation,
          command,
          recoveryEvents: reconstructed.operational.recovery.history,
          operational: reconstructed.operational,
        });

        return {
          status: "Committed" as const,
          snapshot,
          operational: {
            ...reconstructed.operational,
            workflowVersion: nextBundle.workflowVersion,
          },
          organizationId,
          projectId: input.projectId,
        };
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "PersistenceConflict") {
      return { status: "PersistenceConflict" };
    }
    return { status: "DatabaseUnavailable" };
  }
}

export async function commitProductionDecision(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  projectId: string;
  decision: ProductionDecisionInput;
  directory: IdentityDirectory;
  repository: ProjectRepository;
  store: OperationalStore;
  clock: InstantClock;
}): Promise<OperationalCommandResult> {
  if (input.decision.commands.length === 0) {
    return { status: "InvalidTransition" };
  }
  const capability: Capability = capabilityForDecisionCommands(
    input.decision.commands,
  );
  const authorized = await authorizeAndLoadSnapshot({
    ...input,
    capability,
  });
  if (authorized.status !== "ready") return { status: authorized.status };

  const { snapshot, organizationId, currentOperationalAt, actorUserId } =
    authorized;
  const idempotencyKey =
    input.decision.idempotencyKey?.trim() ||
    makeDecisionIdempotencyKey({
      organizationId,
      projectId: input.projectId,
      actorUserId,
      decisionId: input.decision.decisionId,
      commands: input.decision.commands,
    });

  try {
    return await input.store.transact(
      { organizationId, projectId: input.projectId },
      async (tx) => {
        const existing = await tx.findCommandByIdempotencyKey(idempotencyKey);
        const loaded = withBaseline(
          await tx.loadBundle(),
          snapshot,
          organizationId,
        );
        if (existing) {
          const reconstructed = reconstructOperationalWorkspace(snapshot, loaded);
          if (reconstructed.status !== "Reconstructed") {
            return { status: reconstructed.status };
          }
          return {
            status: "AlreadyCommitted" as const,
            snapshot,
            operational: reconstructed.operational,
            organizationId,
            projectId: input.projectId,
          };
        }

        if (
          input.decision.expectedWorkflowVersion !== undefined &&
          input.decision.expectedWorkflowVersion !== loaded.workflowVersion
        ) {
          return { status: "PersistenceConflict" as const };
        }

        const current = reconstructOperationalWorkspace(snapshot, loaded);
        if (current.status !== "Reconstructed") {
          return { status: current.status };
        }
        if (
          !getDecisionById(current.operational.decisions, input.decision.decisionId)
        ) {
          return { status: "ProjectAccessDenied" as const };
        }

        const fsm = input.decision.commands.map((envelope) =>
          toDecisionCommand(envelope, currentOperationalAt),
        );
        const applied = applyCommandsToDecision(
          current.operational.decisions,
          input.decision.decisionId,
          fsm,
        );
        if (!applied.ok) {
          return { status: "InvalidTransition" as const };
        }

        const command: PersistedCommand = {
          id: makeCommandId({
            organizationId,
            projectId: input.projectId,
            idempotencyKey,
          }),
          organizationId,
          projectId: input.projectId,
          seq: loaded.commandSeq + 1,
          kind: "decision_transition",
          observationId: null,
          decisionId: input.decision.decisionId,
          actorUserId,
          committedAt: currentOperationalAt,
          idempotencyKey,
          fsmCommands: input.decision.commands,
        };
        const nextBundle: OperationalBundle = {
          ...loaded,
          workflowVersion: loaded.workflowVersion + 1,
          commandSeq: command.seq,
          commands: [...loaded.commands, command],
        };
        const reconstructed = reconstructOperationalWorkspace(
          snapshot,
          nextBundle,
        );
        if (reconstructed.status !== "Reconstructed") {
          return { status: reconstructed.status };
        }

        await tx.commit({
          head: {
            organizationId,
            projectId: input.projectId,
            workflowVersion: nextBundle.workflowVersion,
            commandSeq: nextBundle.commandSeq,
            replayBaselineAt: nextBundle.replayBaselineAt,
            currentlyRecoveredIssueIds:
              reconstructed.operational.recovery.currentlyRecoveredIssueIds,
          },
          command,
          recoveryEvents: reconstructed.operational.recovery.history,
          operational: reconstructed.operational,
        });

        return {
          status: "Committed" as const,
          snapshot,
          operational: {
            ...reconstructed.operational,
            workflowVersion: nextBundle.workflowVersion,
          },
          organizationId,
          projectId: input.projectId,
        };
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "PersistenceConflict") {
      return { status: "PersistenceConflict" };
    }
    return { status: "DatabaseUnavailable" };
  }
}

async function authorizeAndLoadSnapshot(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  projectId: string;
  capability: Capability;
  directory: IdentityDirectory;
  repository: ProjectRepository;
  clock: InstantClock;
}): Promise<
  | {
      status: "ready";
      snapshot: ProjectSnapshot;
      organizationId: string;
      actorUserId: string;
      currentOperationalAt: string;
    }
  | { status: OperationalFailureStatus }
> {
  const authorization = await authorizeProjectRequest({
    identity: input.identity,
    organizationId: input.requestedOrganizationId,
    projectId: input.projectId,
    capability: input.capability,
    directory: input.directory,
  });
  if (!isAuthorized(authorization)) {
    return { status: authorization.status };
  }

  const currentOperationalAt = input.clock.nowIso();
  let loaded;
  try {
    loaded = await input.repository.loadProjectSnapshot({
      tenantScope: authorization.scope,
      projectId: input.projectId,
      currentOperationalAt,
    });
  } catch {
    return { status: "DatabaseUnavailable" };
  }

  if (loaded.status === "DatabaseUnavailable") {
    return { status: "DatabaseUnavailable" };
  }
  if (loaded.status === "ProjectNotFound") {
    return { status: "ProjectNotFound" };
  }
  if (loaded.status === "InvalidProjectData") {
          return { status: "InvalidProjectData" };
        }
        if (!validateProjectSnapshot(loaded.snapshot).ok) {
          return { status: "InvalidProjectData" };
  }

  return {
    status: "ready",
    snapshot: loaded.snapshot,
    organizationId: authorization.scope.organizationId,
    actorUserId: authorization.scope.actorUserId,
    currentOperationalAt,
  };
}

function withBaseline(
  bundle: OperationalBundle,
  snapshot: ProjectSnapshot,
  organizationId: string,
): OperationalBundle {
  if (bundle.commandSeq > 0) return bundle;
  const empty = emptyOperationalBundle({
    organizationId,
    projectId: snapshot.project.id,
    replayBaselineAt: replayBaselineFromSnapshot(snapshot),
  });
  return {
    ...empty,
    workflowVersion: bundle.workflowVersion,
  };
}
