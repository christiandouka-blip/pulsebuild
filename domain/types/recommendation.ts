import type {
  ConfidenceAssessment,
  ReasoningEvidence,
} from "@/domain/types/reasoning";

export type ApprovalRequirement = {
  required: boolean;
  reason: string | null;
};

export type RecommendationAlternative = {
  action: string;
  rationale: string;
  expectedBenefit: string;
  /** Action-specific evidence for this alternative (identifiers and facts). */
  evidence: ReasoningEvidence[];
};

/**
 * Phase 3A recommendation — generation only (PO Decision 8).
 * Must not approve, reject, execute, mutate, or verify.
 */
export type RecommendationProposal = {
  id: string;
  signalId: string;
  issueId: string | null;
  primaryAction: string;
  rationale: string;
  expectedBenefit: string;
  approval: ApprovalRequirement;
  alternatives: RecommendationAlternative[];
  confidence: ConfidenceAssessment;
  evidence: ReasoningEvidence[];
};
