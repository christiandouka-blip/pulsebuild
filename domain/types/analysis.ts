import type { CrewId, TaskId } from "@/domain/types/identifiers";
import type { PriorityTier } from "@/domain/types/signal";
import type {
  ConfidenceAssessment,
  ExposureCategory,
  ReasoningEvidence,
} from "@/domain/types/reasoning";

/** Deterministic dependency-impact analysis (SoT §10, CRS §7). */
export type DependencyImpact = {
  originTaskId: TaskId | null;
  immediateTaskIds: TaskId[];
  affectedTaskIds: TaskId[];
  cascadeDepth: number;
  criticalPathImpacted: boolean;
  evidence: ReasoningEvidence[];
};

export type PriorityRuleEffect = "upgrade" | "preserve" | "lower";

/** One documented rule application explaining a deviation from the baseline hint. */
export type PriorityAdjustment = {
  ruleId: string;
  description: string;
  effect: PriorityRuleEffect;
  resultingTier: PriorityTier;
};

/** Priority classification from the documented rule table (PO Decision 4). */
export type PriorityResult = {
  baselineHint: PriorityTier;
  finalTier: PriorityTier;
  adjustments: PriorityAdjustment[];
  confidence: ConfidenceAssessment;
  evidence: ReasoningEvidence[];
};

/** Deterministic operational projection (PO Decision 1). Never mutates state. */
export type PredictionResult = {
  affectedTaskIds: TaskId[];
  cascadeDepth: number;
  criticalPathExposure: ExposureCategory;
  idleCrewRisk: {
    category: ExposureCategory;
    crewIds: CrewId[];
  };
  scheduleExposure: {
    category: ExposureCategory;
    estimatedHours: number | null;
  };
  projectedConsequence: string;
  confidence: ConfidenceAssessment;
  evidence: ReasoningEvidence[];
};
