import type { ProductionDecisionInput, ProductionObservationInput } from "@/domain/operations/types";
import {
  applyReconstructedOperational,
} from "@/lib/orchestration/commandCenter";
import {
  commitProductionDecisionAction,
  commitProductionObservationAction,
  type ProductionCommitActionResult,
} from "@/lib/operations/actions";
import { useProjectStore } from "@/store/useProjectStore";

export async function commitWorkspaceObservation(
  observation: ProductionObservationInput,
): Promise<ProductionCommitActionResult> {
  const snapshot = useProjectStore.getState().snapshot;
  if (!snapshot) {
    return { status: "InvalidObservation" };
  }
  const result = await commitProductionObservationAction({
    projectId: snapshot.project.id,
    observation: {
      ...observation,
      expectedWorkflowVersion:
        observation.expectedWorkflowVersion ??
        useProjectStore.getState().operational?.workflowVersion,
    },
  });
  if (result.status === "Committed" || result.status === "AlreadyCommitted") {
    useProjectStore
      .getState()
      .loadWorkspaceSnapshot(result.snapshot, result.operational);
    applyReconstructedOperational(result.snapshot, result.operational);
  }
  return result;
}

export async function commitWorkspaceDecision(
  decision: ProductionDecisionInput,
): Promise<ProductionCommitActionResult> {
  const snapshot = useProjectStore.getState().snapshot;
  if (!snapshot) {
    return { status: "InvalidTransition" };
  }
  const result = await commitProductionDecisionAction({
    projectId: snapshot.project.id,
    decision: {
      ...decision,
      expectedWorkflowVersion:
        decision.expectedWorkflowVersion ??
        useProjectStore.getState().operational?.workflowVersion,
    },
  });
  if (result.status === "Committed" || result.status === "AlreadyCommitted") {
    useProjectStore
      .getState()
      .loadWorkspaceSnapshot(result.snapshot, result.operational);
    applyReconstructedOperational(result.snapshot, result.operational);
  }
  return result;
}
