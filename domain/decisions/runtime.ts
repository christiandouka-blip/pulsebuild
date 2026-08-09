/**
 * Phase 3B Decision Runtime — pure collection + intake + lookups.
 *
 * Independent of ReasoningRuntime. References recommendations by id only.
 * Does not regenerate recommendations or mutate ProjectSnapshot.
 */

import { buildProposalFacts } from "@/domain/decisions/proposalFacts";
import { isTerminalDecisionState } from "@/domain/decisions/selectors";
import { createOperationalDecision } from "@/domain/decisions/transition";
import type {
  DecisionState,
  OperationalDecision,
  ProposalFacts,
} from "@/domain/decisions/types";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { RecommendationProposal } from "@/domain/types/recommendation";

export type DecisionRuntime = {
  decisions: OperationalDecision[];
  /**
   * Action-identity facts keyed by recommendationId.
   * Contains no evidence and is not a RecommendationProposal clone.
   */
  proposalFactsByRecommendationId: Readonly<Record<string, ProposalFacts>>;
};

export type DecisionCounts = {
  total: number;
  pendingReview: number;
  approved: number;
  pendingExecution: number;
  blocked: number;
  awaitingVerification: number;
  verificationFailed: number;
  verified: number;
  acknowledged: number;
  rejected: number;
  cancelled: number;
  terminal: number;
};

export function initialDecisionRuntime(): DecisionRuntime {
  return {
    decisions: [],
    proposalFactsByRecommendationId: {},
  };
}

/**
 * Pure intake: for every RecommendationProposal without an existing decision,
 * open one OperationalDecision in PendingReview. Never duplicates. Never
 * mutates the ReasoningRuntime input.
 */
export function intakeDecisions(
  reasoning: ReasoningRuntime,
  runtime: DecisionRuntime,
): DecisionRuntime {
  const existingByRecommendation = new Map(
    runtime.decisions.map((d) => [d.recommendationId, d]),
  );
  const facts: Record<string, ProposalFacts> = {
    ...runtime.proposalFactsByRecommendationId,
  };
  const created: OperationalDecision[] = [];

  const proposals = listProposals(reasoning);
  for (const { proposal, observedAtSimulated } of proposals) {
    if (!facts[proposal.id]) {
      facts[proposal.id] = buildProposalFacts(proposal);
    }
    if (existingByRecommendation.has(proposal.id)) continue;

    const proposalFacts = facts[proposal.id];
    created.push(
      createOperationalDecision({
        id: `decision-${proposal.id}`,
        recommendationId: proposal.id,
        signalId: proposal.signalId,
        issueId: proposal.issueId,
        approvalRequired: proposal.approval.required,
        mutatesOperationalState: proposalFacts.primaryAction.mutatesOperationalState,
        createdAtSimulated: observedAtSimulated,
      }),
    );
  }

  if (created.length === 0) {
    // Still refresh facts for any new recommendation ids without new decisions
    // (should not happen if decisions exist), but keep referential stability
    // when nothing changed.
    const factsUnchanged =
      Object.keys(facts).length ===
        Object.keys(runtime.proposalFactsByRecommendationId).length &&
      Object.keys(facts).every(
        (id) => facts[id] === runtime.proposalFactsByRecommendationId[id],
      );
    if (factsUnchanged) return runtime;
  }

  const decisions = [...runtime.decisions, ...created].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return {
    decisions,
    proposalFactsByRecommendationId: facts,
  };
}

export function getDecisionById(
  runtime: DecisionRuntime,
  decisionId: string,
): OperationalDecision | undefined {
  return runtime.decisions.find((d) => d.id === decisionId);
}

export function getDecisionByRecommendationId(
  runtime: DecisionRuntime,
  recommendationId: string,
): OperationalDecision | undefined {
  return runtime.decisions.find((d) => d.recommendationId === recommendationId);
}

export function getDecisionsBySignalId(
  runtime: DecisionRuntime,
  signalId: string,
): OperationalDecision[] {
  return runtime.decisions.filter((d) => d.signalId === signalId);
}

export function decisionsInState(
  runtime: DecisionRuntime,
  state: DecisionState,
): OperationalDecision[] {
  return runtime.decisions.filter((d) => d.state === state);
}

export function pendingReview(runtime: DecisionRuntime): OperationalDecision[] {
  return decisionsInState(runtime, "PendingReview");
}

export function approved(runtime: DecisionRuntime): OperationalDecision[] {
  return decisionsInState(runtime, "Approved");
}

export function pendingExecution(runtime: DecisionRuntime): OperationalDecision[] {
  return decisionsInState(runtime, "PendingExecution");
}

export function blocked(runtime: DecisionRuntime): OperationalDecision[] {
  return decisionsInState(runtime, "Blocked");
}

export function awaitingVerification(
  runtime: DecisionRuntime,
): OperationalDecision[] {
  return decisionsInState(runtime, "AwaitingVerification");
}

export function verified(runtime: DecisionRuntime): OperationalDecision[] {
  return decisionsInState(runtime, "Verified");
}

export function terminal(runtime: DecisionRuntime): OperationalDecision[] {
  return runtime.decisions.filter((d) => isTerminalDecisionState(d.state));
}

export function decisionCounts(runtime: DecisionRuntime): DecisionCounts {
  const count = (state: DecisionState) =>
    runtime.decisions.filter((d) => d.state === state).length;
  return {
    total: runtime.decisions.length,
    pendingReview: count("PendingReview"),
    approved: count("Approved"),
    pendingExecution: count("PendingExecution"),
    blocked: count("Blocked"),
    awaitingVerification: count("AwaitingVerification"),
    verificationFailed: count("VerificationFailed"),
    verified: count("Verified"),
    acknowledged: count("Acknowledged"),
    rejected: count("Rejected"),
    cancelled: count("Cancelled"),
    terminal: terminal(runtime).length,
  };
}

/** Replace one decision immutably; unknown id returns the same runtime. */
export function replaceDecision(
  runtime: DecisionRuntime,
  next: OperationalDecision,
): DecisionRuntime {
  const index = runtime.decisions.findIndex((d) => d.id === next.id);
  if (index < 0) return runtime;
  const decisions = runtime.decisions.slice();
  decisions[index] = next;
  return {
    decisions,
    proposalFactsByRecommendationId: runtime.proposalFactsByRecommendationId,
  };
}

function listProposals(reasoning: ReasoningRuntime): Array<{
  proposal: RecommendationProposal;
  observedAtSimulated: string;
}> {
  const out: Array<{
    proposal: RecommendationProposal;
    observedAtSimulated: string;
  }> = [];
  for (const entry of reasoning.reasonings) {
    if (entry.recommendation === null) continue;
    out.push({
      proposal: entry.recommendation,
      observedAtSimulated: entry.signal.observedAtSimulated,
    });
  }
  // Deterministic order by recommendation id
  out.sort((a, b) => a.proposal.id.localeCompare(b.proposal.id));
  return out;
}
