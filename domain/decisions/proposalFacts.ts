/**
 * Derive ProposalFacts from an immutable RecommendationProposal.
 *
 * Does not clone evidence. Infers mutatesOperationalState deterministically
 * from action text to match Phase 3A candidate semantics (proposal type does
 * not currently expose a mutates flag).
 */

import type { ProposalFacts } from "@/domain/decisions/types";
import type { RecommendationProposal } from "@/domain/types/recommendation";

export function buildProposalFacts(
  proposal: RecommendationProposal,
): ProposalFacts {
  return {
    approvalRequired: proposal.approval.required,
    primaryAction: {
      action: proposal.primaryAction,
      mutatesOperationalState: inferMutatesOperationalState(proposal.primaryAction),
    },
    alternatives: proposal.alternatives.map((alt) => ({
      action: alt.action,
      mutatesOperationalState: inferMutatesOperationalState(alt.action),
    })),
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
