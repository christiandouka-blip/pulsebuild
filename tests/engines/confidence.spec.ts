import { describe, expect, it } from "vitest";

import { assessConfidence } from "@/domain/engines/confidence";
import type { ConfidenceInput } from "@/domain/types/reasoning";

const full: ConfidenceInput = {
  referencedEntityExists: true,
  relatedTaskExists: true,
  requiredResourceStatesKnown: true,
  dependencyDataComplete: true,
  evidenceRecordsAvailable: true,
  relevantDatesAvailable: true,
  supportingFacts: ["All facts known"],
  missingFacts: [],
  conflictingFacts: [],
};

describe("confidence helper — category boundaries", () => {
  it("returns Very High when every fact is known and there are no conflicts", () => {
    expect(assessConfidence(full).category).toBe("Very High");
  });

  it("returns High when one secondary fact is missing", () => {
    const result = assessConfidence({
      ...full,
      relevantDatesAvailable: false,
      missingFacts: ["Relevant dates missing"],
    });
    expect(result.category).toBe("High");
  });

  it("returns Very Low when conflicting facts are present", () => {
    const result = assessConfidence({
      ...full,
      conflictingFacts: ["Material marked received and delayed"],
    });
    expect(result.category).toBe("Very Low");
    expect(result.explanation).toContain("Conflicts");
  });

  it("returns Very Low when the related task is missing", () => {
    expect(
      assessConfidence({ ...full, relatedTaskExists: false }).category,
    ).toBe("Very Low");
  });

  it("returns Moderate when exactly one core gap exists", () => {
    expect(
      assessConfidence({ ...full, dependencyDataComplete: false }).category,
    ).toBe("Moderate");
  });

  it("returns Low when both resource and dependency data are incomplete", () => {
    expect(
      assessConfidence({
        ...full,
        requiredResourceStatesKnown: false,
        dependencyDataComplete: false,
      }).category,
    ).toBe("Low");
  });
});
