/**
 * Shared deterministic reasoning primitives — Phase 3A.
 *
 * These types are consumed by every engine. They carry no React, Zustand,
 * browser, or network concern and hold no runtime conclusions from the
 * read-only ProjectSnapshot.
 */

/** A single structured, traceable justification produced by an engine. */
export type ReasoningEvidence = {
  entityType: string;
  entityId: string;
  fact: string;
};

/**
 * Deterministic operational exposure category — PO Decision 1.
 * Used when a precise numeric estimate is not supportable from typed data.
 */
export type ExposureCategory =
  | "No measurable exposure"
  | "Low exposure"
  | "Moderate exposure"
  | "High exposure"
  | "Critical exposure";

/** Deterministic confidence categories — PO Decision 5. No percentages. */
export type ConfidenceCategory =
  | "Very High"
  | "High"
  | "Moderate"
  | "Low"
  | "Very Low";

/** Explicit facts that deterministically produce a confidence category. */
export type ConfidenceInput = {
  referencedEntityExists: boolean;
  relatedTaskExists: boolean;
  requiredResourceStatesKnown: boolean;
  dependencyDataComplete: boolean;
  evidenceRecordsAvailable: boolean;
  relevantDatesAvailable: boolean;
  supportingFacts: string[];
  missingFacts: string[];
  conflictingFacts: string[];
};

export type ConfidenceAssessment = {
  category: ConfidenceCategory;
  supportingFacts: string[];
  missingFacts: string[];
  conflictingFacts: string[];
  explanation: string;
};
