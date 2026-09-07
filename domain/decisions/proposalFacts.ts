/**
 * Derive ProposalFacts from an immutable RecommendationProposal.
 *
 * Does not clone evidence. Descriptor-first: when a structured action
 * descriptor is present it is authoritative and is carried through unchanged.
 * Prose inference remains only for a descriptor-less legacy proposal.
 */

import type { ProposalActionFact, ProposalFacts } from "@/domain/decisions/types";
import type {
  RecommendationActionDescriptor,
  RecommendationProposal,
} from "@/domain/types/recommendation";

export function buildProposalFacts(
  proposal: RecommendationProposal,
): ProposalFacts {
  return {
    approvalRequired: proposal.approval.required,
    primaryAction: toActionFact(proposal.primaryAction, proposal.actionDescriptor),
    alternatives: proposal.alternatives.map((alt) =>
      toActionFact(alt.action, alt.actionDescriptor),
    ),
  };
}

function toActionFact(
  action: string,
  descriptor: RecommendationActionDescriptor | undefined,
): ProposalActionFact {
  if (descriptor) {
    return {
      action,
      mutatesOperationalState: descriptor.mutatesOperationalState,
      descriptor,
    };
  }
  return {
    action,
    mutatesOperationalState: inferMutatesOperationalState(action),
  };
}

/**
 * Phase 3A mutating primaries: safety protect, crew reassignment, resequence.
 * All other generated actions are non-mutating proposals/monitoring.
 */
export function inferMutatesOperationalState(action: string): boolean {
  if (/^Protect affected work\b/i.test(action)) return true;
  if (/^Propose reassigning\b/i.test(action)) return true;
  if (/^Resequence work\b/i.test(action)) return true;
  return false;
}
