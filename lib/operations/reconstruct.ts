import {
  applyCommandsToDecision,
} from "@/domain/decisions/applyCommands";
import {
  getDecisionById,
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions/runtime";
import {
  initialOverlayRuntime,
  syncOverlayFromDecisions,
  syncOverlayFromRuntimes,
} from "@/domain/effects/runtime";
import {
  initialRuntime,
  processNextObservation,
} from "@/domain/engines/reasoningPipeline";
import {
  initialRecoveryRuntime,
  recomputeRecoveryRuntime,
} from "@/domain/recovery/runtime";
import type {
  OperationalBundle,
  ReconstructResult,
  ReconstructedOperationalState,
} from "@/domain/operations/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { toDecisionCommand } from "@/lib/operations/decisionCommands";
import { buildReplaySnapshot } from "@/lib/operations/replaySnapshot";

export function emptyOperationalBundle(input: {
  organizationId: string;
  projectId: string;
  replayBaselineAt: string;
}): OperationalBundle {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    workflowVersion: 0,
    commandSeq: 0,
    replayBaselineAt: input.replayBaselineAt,
    currentlyRecoveredIssueIds: [],
    observations: [],
    commands: [],
    recoveryEvents: [],
  };
}

export function reconstructOperationalWorkspace(
  snapshot: ProjectSnapshot,
  bundle: OperationalBundle,
): ReconstructResult {
  if (snapshot.project.id !== bundle.projectId) {
    return {
      status: "InvalidPersistedOperationalData",
      message: "Persisted history does not belong to this project.",
    };
  }

  const observationsById = new Map(
    bundle.observations.map((item) => [item.id, item]),
  );
  const commands = [...bundle.commands].sort((a, b) => a.seq - b.seq);
  const replaySnapshot = buildReplaySnapshot(
    snapshot,
    bundle.observations,
    bundle.replayBaselineAt,
  );

  let reasoning = initialRuntime();
  let decisions = initialDecisionRuntime();
  let overlay = initialOverlayRuntime(snapshot);
  let recovery = initialRecoveryRuntime(snapshot);

  for (const command of commands) {
    if (command.organizationId !== bundle.organizationId) {
      return {
        status: "InvalidPersistedOperationalData",
        message: "Operational command organization does not match the project tenant.",
      };
    }
    if (command.projectId !== bundle.projectId) {
      return {
        status: "InvalidPersistedOperationalData",
        message: "Operational command project does not match the authorized project.",
      };
    }

    if (command.kind === "observation") {
      if (!command.observationId || !observationsById.has(command.observationId)) {
        return {
          status: "InvalidPersistedOperationalData",
          message: "Observation command is missing its observation record.",
        };
      }
      const processedBefore = reasoning.processedFixtureIds.length;
      reasoning = processNextObservation(replaySnapshot, reasoning);
      if (reasoning.processedFixtureIds.length === processedBefore) {
        return {
          status: "ReconstructionFailure",
          message: "Observation history could not be replayed through the reasoning pipeline.",
        };
      }
      decisions = intakeDecisions(reasoning, decisions);
      overlay = syncOverlayFromRuntimes(overlay, reasoning, decisions);
      const recovered = recomputeRecoveryRuntime({
        history: recovery.history,
        currentlyRecoveredIssueIds: recovery.currentlyRecoveredIssueIds,
        reasoning,
        effective: overlay.effective,
        evaluationSimulatedAt: command.committedAt,
      });
      if (!recovered.ok) {
        return {
          status: "ReconstructionFailure",
          message: recovered.error.message,
        };
      }
      recovery = recovered.runtime;
      continue;
    }

    if (!command.decisionId) {
      return {
        status: "InvalidPersistedOperationalData",
        message: "Decision command is missing a decision id.",
      };
    }
    if (!getDecisionById(decisions, command.decisionId)) {
      return {
        status: "InvalidPersistedOperationalData",
        message: "Decision command references a decision that is not in this project.",
      };
    }
    const fsm = command.fsmCommands.map((envelope) =>
      toDecisionCommand(envelope, command.committedAt),
    );
    const applied = applyCommandsToDecision(decisions, command.decisionId, fsm);
    if (!applied.ok) {
      return {
        status: "ReconstructionFailure",
        message: applied.error.message,
      };
    }
    decisions = applied.runtime;
    overlay = syncOverlayFromDecisions(overlay, decisions);
    const recovered = recomputeRecoveryRuntime({
      history: recovery.history,
      currentlyRecoveredIssueIds: recovery.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlay.effective,
      evaluationSimulatedAt: command.committedAt,
    });
    if (!recovered.ok) {
      return {
        status: "ReconstructionFailure",
        message: recovered.error.message,
      };
    }
    recovery = recovered.runtime;
  }

  const operational: ReconstructedOperationalState = {
    reasoning,
    decisions,
    overlay,
    recovery,
    workflowVersion: bundle.workflowVersion,
    replayBaselineAt: bundle.replayBaselineAt,
  };
  return { status: "Reconstructed", operational };
}
