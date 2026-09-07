import type { RecommendationRuleId } from "@/domain/constants/recommendationRules";
import type { TaskId } from "@/domain/types/identifiers";
import type {
  ConfidenceAssessment,
  ReasoningEvidence,
} from "@/domain/types/reasoning";

export type ApprovalRequirement = {
  required: boolean;
  reason: string | null;
};

/** Entity kinds an action can act on, mirroring the generating rule's subject. */
export type RecommendationSubjectEntityType =
  | "task"
  | "crew"
  | "material"
  | "inspection";

/**
 * Structured action identity — Phase 3C Step 1.
 *
 * Preserves the identity each recommendation rule already computes so later
 * consumers resolve an action from typed facts instead of prose. The same
 * descriptor contract applies to the primary action and to every alternative.
 *
 * mutatesOperationalState keeps its Phase 3B meaning — the workflow requires a
 * field-execution step — and is not operational-overlay eligibility.
 */
export type RecommendationActionDescriptor = {
  /** Authoritative discriminator: the rule that generated the action. */
  ruleId: RecommendationRuleId;
  mutatesOperationalState: boolean;
  subjectEntityType: RecommendationSubjectEntityType;
  subjectEntityId: string;
  /** The exposed or blocked task the action responds to. */
  originTaskId: TaskId;
  /** Alternate task, only where the rule computes one. */
  targetTaskId?: TaskId;
};

export type RecommendationAlternative = {
  action: string;
  rationale: string;
  expectedBenefit: string;
  /** Action-specific evidence for this alternative (identifiers and facts). */
  evidence: ReasoningEvidence[];
  /** Absent only on a descriptor-less legacy proposal. */
  actionDescriptor?: RecommendationActionDescriptor;
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
  /** Absent only on a descriptor-less legacy proposal. */
  actionDescriptor?: RecommendationActionDescriptor;
};
