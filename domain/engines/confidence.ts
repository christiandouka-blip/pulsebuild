import type {
  ConfidenceAssessment,
  ConfidenceCategory,
  ConfidenceInput,
} from "@/domain/types/reasoning";

/**
 * Confidence helper — PO Decision 5.
 *
 * Deterministic evidence-category mapping. No percentages, no randomness.
 * Every result explains why the category was assigned.
 */
export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const category = deriveCategory(input);
  return {
    category,
    supportingFacts: input.supportingFacts,
    missingFacts: input.missingFacts,
    conflictingFacts: input.conflictingFacts,
    explanation: buildExplanation(category, input),
  };
}

function deriveCategory(input: ConfidenceInput): ConfidenceCategory {
  const {
    referencedEntityExists,
    relatedTaskExists,
    requiredResourceStatesKnown,
    dependencyDataComplete,
    evidenceRecordsAvailable,
    relevantDatesAvailable,
    conflictingFacts,
  } = input;

  // Very Low: core references unresolved or contradictory facts present.
  if (!referencedEntityExists || !relatedTaskExists) return "Very Low";
  if (conflictingFacts.length > 0) return "Very Low";

  // Very High: every fact known, no gaps, no conflicts.
  if (
    requiredResourceStatesKnown &&
    dependencyDataComplete &&
    evidenceRecordsAvailable &&
    relevantDatesAvailable
  ) {
    return "Very High";
  }

  // High: resource and dependency data known; at most one of evidence/dates missing.
  if (requiredResourceStatesKnown && dependencyDataComplete) {
    const softGaps = [evidenceRecordsAvailable, relevantDatesAvailable].filter(
      (known) => !known,
    ).length;
    if (softGaps <= 1) return "High";
    return "Moderate";
  }

  // Moderate: exactly one of resource/dependency data incomplete.
  const coreGaps = [requiredResourceStatesKnown, dependencyDataComplete].filter(
    (known) => !known,
  ).length;
  if (coreGaps === 1) return "Moderate";

  // Low: both resource and dependency data incomplete.
  return "Low";
}

function buildExplanation(
  category: ConfidenceCategory,
  input: ConfidenceInput,
): string {
  const parts: string[] = [`Confidence ${category}.`];
  if (input.supportingFacts.length > 0) {
    parts.push(`Supported by: ${input.supportingFacts.join("; ")}.`);
  }
  if (input.missingFacts.length > 0) {
    parts.push(`Missing: ${input.missingFacts.join("; ")}.`);
  }
  if (input.conflictingFacts.length > 0) {
    parts.push(`Conflicts: ${input.conflictingFacts.join("; ")}.`);
  }
  return parts.join(" ");
}
