import { describe, expect, it } from "vitest";

import { HEALTH_MAX, HEALTH_PROVEN_RECOVERY_BONUS } from "@/domain/constants/scoringConstants";
import {
  applyOperationalEffects,
  createEffectiveProjectSnapshot,
  resolveObservationEffect,
  verifyOperationalIssue,
} from "@/domain/effects";
import type { IssueResolutionRecord } from "@/domain/effects";
import { computeHealth } from "@/domain/engines/healthEngine";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { computeEffectiveScores } from "@/domain/recovery";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { freshSnapshot } from "@/tests/engines/helpers";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function processUntil(
  snapshot: ProjectSnapshot,
  fixtureId: string,
): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
    if (runtime.processedFixtureIds.includes(fixtureId)) break;
  }
  return runtime;
}

function materialRecovery(snapshot: ProjectSnapshot, runtime: ReasoningRuntime) {
  const delivery = runtime.reasonings.find(
    (r) => r.signal.type === "DeliveryReceived",
  );
  if (!delivery) throw new Error("missing DeliveryReceived reasoning");
  const resolved = resolveObservationEffect(delivery.signal);
  if (resolved.outcome !== "Resolved") {
    throw new Error("DeliveryReceived did not resolve an effect");
  }
  const applied = applyOperationalEffects(snapshot, [resolved.effect]);
  const material = runtime.reasonings.find(
    (r) => r.issue?.kind === "MaterialDeliveryDelayed",
  );
  if (!material || material.issue === null) {
    throw new Error("missing MaterialDeliveryDelayed issue");
  }
  const verification = verifyOperationalIssue({
    issue: material.issue,
    signal: material.signal,
    effective: applied.effective,
  });
  if (verification.outcome !== "Recovered") {
    throw new Error(`expected Recovered, got ${verification.outcome}`);
  }
  return {
    effective: applied.effective,
    resolution: verification.resolution,
    materialIssue: material.issue,
    materialReasoning: material,
  };
}

function scoresAfterMaterialRecovery() {
  const snapshot = freshSnapshot();
  const runtime = processAll(snapshot);
  const recovered = materialRecovery(snapshot, runtime);
  const scores = computeEffectiveScores({
    runtime,
    effective: recovered.effective,
    resolutionRecords: [recovered.resolution],
  });
  return { snapshot, runtime, recovered, scores };
}

describe("baseline equivalence", () => {
  it("matches Phase 3A Health 100 / Drift 0 before observations", () => {
    const snapshot = freshSnapshot();
    const scores = computeEffectiveScores({
      runtime: initialRuntime(),
      effective: createEffectiveProjectSnapshot(snapshot),
      resolutionRecords: [],
    });
    expect(scores.health.score).toBe(100);
    expect(scores.health.band).toBe("green");
    expect(scores.drift.score).toBe(0);
    expect(scores.drift.label).toBe("Normal");
    expect(scores.effectiveOpenIssueIds).toEqual([]);
    expect(scores.currentlyResolvedIssueIds).toEqual([]);
  });

  it("matches frozen Phase 3A Health 11 / Drift 120 after five fixtures and no recovery", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    expect(runtime.health.score).toBe(11);
    expect(runtime.drift.score).toBe(120);
    const scores = computeEffectiveScores({
      runtime,
      effective: createEffectiveProjectSnapshot(snapshot),
      resolutionRecords: [],
    });
    expect(scores.health).toEqual(runtime.health);
    expect(scores.drift).toEqual(runtime.drift);
    expect(scores.health.score).toBe(11);
    expect(scores.drift.score).toBe(120);
  });
});

describe("seeded material recovery", () => {
  it("produces Health 41 red and Drift 95 Critical Drift", () => {
    const { scores, recovered } = scoresAfterMaterialRecovery();
    expect(scores.health.score).toBe(41);
    expect(scores.health.band).toBe("red");
    expect(scores.drift.score).toBe(95);
    expect(scores.drift.label).toBe("Critical Drift");
    expect(scores.currentlyResolvedIssueIds).toEqual([recovered.materialIssue.id]);
  });

  it("removes the resolved material issue from the effective open set", () => {
    const { scores, recovered, runtime } = scoresAfterMaterialRecovery();
    expect(scores.effectiveOpenIssueIds).not.toContain(recovered.materialIssue.id);
    const weather = runtime.reasonings.find((r) => r.issue?.kind === "WeatherAlert");
    const inspection = runtime.reasonings.find(
      (r) => r.issue?.kind === "InspectionMissing",
    );
    expect(weather?.issue).toBeTruthy();
    expect(inspection?.issue).toBeTruthy();
    expect(scores.effectiveOpenIssueIds).toContain(weather!.issue!.id);
    expect(scores.effectiveOpenIssueIds).toContain(inspection!.issue!.id);
  });

  it("keeps shared affected tasks because other issues remain open", () => {
    const { scores } = scoresAfterMaterialRecovery();
    const affectedLine = scores.health.breakdown.find((line) =>
      line.label.includes("affected downstream task"),
    );
    expect(affectedLine?.sourceEntityIds).toHaveLength(7);
    const driftAffected = scores.drift.breakdown.find((line) =>
      line.label.includes("affected task"),
    );
    expect(driftAffected?.sourceEntityIds).toHaveLength(7);
  });

  it("awards +5 verified operational recovery exactly once", () => {
    const { scores, recovered } = scoresAfterMaterialRecovery();
    const bonusLines = scores.health.breakdown.filter(
      (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
    );
    expect(bonusLines).toHaveLength(1);
    expect(bonusLines[0].label).toBe(
      `Verified operational recovery (${recovered.materialIssue.id})`,
    );
    expect(bonusLines[0].sourceEntityIds).toEqual([recovered.materialIssue.id]);
    expect(bonusLines[0].label.toLowerCase()).not.toContain("workflow");
  });

  it("does not duplicate +5 for duplicate resolution records", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const recovered = materialRecovery(snapshot, runtime);
    const scores = computeEffectiveScores({
      runtime,
      effective: recovered.effective,
      resolutionRecords: [recovered.resolution, recovered.resolution],
    });
    const bonusLines = scores.health.breakdown.filter(
      (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
    );
    expect(bonusLines).toHaveLength(1);
    expect(scores.currentlyResolvedIssueIds).toEqual([recovered.materialIssue.id]);
    expect(scores.health.score).toBe(41);
  });
});

describe("no bonus without proven resolution", () => {
  it("does not award a bonus from DecisionState or workflow facts", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const scores = computeEffectiveScores({
      runtime,
      effective: createEffectiveProjectSnapshot(snapshot),
      resolutionRecords: [],
    });
    expect(scores.health.score).toBe(11);
    expect(
      scores.health.breakdown.some((line) =>
        line.label.includes("Verified operational recovery"),
      ),
    ).toBe(false);
    expect(scores.currentlyResolvedIssueIds).toEqual([]);
  });

  it("does not award a bonus for an applied effect without a proven resolution record", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const delivery = runtime.reasonings.find((r) => r.signal.type === "DeliveryReceived")!;
    const resolved = resolveObservationEffect(delivery.signal);
    if (resolved.outcome !== "Resolved") throw new Error("expected effect");
    const { effective } = applyOperationalEffects(snapshot, [resolved.effect]);
    const scores = computeEffectiveScores({
      runtime,
      effective,
      resolutionRecords: [],
    });
    expect(scores.health.score).toBe(11);
    expect(scores.currentlyResolvedIssueIds).toEqual([]);
    const material = runtime.reasonings.find(
      (r) => r.issue?.kind === "MaterialDeliveryDelayed",
    );
    expect(material?.issue).toBeTruthy();
    expect(scores.effectiveOpenIssueIds).toContain(material!.issue!.id);
  });
});

describe("reopening", () => {
  it("returns the issue to the effective open set and withdraws +5 when facts regress", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const recovered = materialRecovery(snapshot, runtime);
    const historical: IssueResolutionRecord = recovered.resolution;
    const reopened = computeEffectiveScores({
      runtime,
      effective: createEffectiveProjectSnapshot(snapshot),
      resolutionRecords: [historical],
    });
    expect(reopened.currentlyResolvedIssueIds).toEqual([]);
    expect(reopened.effectiveOpenIssueIds).toContain(recovered.materialIssue.id);
    expect(reopened.health.score).toBe(11);
    expect(reopened.drift.score).toBe(120);
    expect(
      reopened.health.breakdown.some((line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS),
    ).toBe(false);
    expect(JSON.stringify(historical)).toBe(JSON.stringify(recovered.resolution));
  });
});

describe("immutability, determinism, and drift isolation", () => {
  it("does not mutate issues, runtime, or the effective snapshot", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const recovered = materialRecovery(snapshot, runtime);
    const issueBefore = JSON.stringify(recovered.materialIssue);
    const runtimeBefore = JSON.stringify(runtime);
    const effectiveBefore = JSON.stringify(recovered.effective);

    computeEffectiveScores({
      runtime,
      effective: recovered.effective,
      resolutionRecords: [recovered.resolution],
    });

    expect(JSON.stringify(recovered.materialIssue)).toBe(issueBefore);
    expect(recovered.materialIssue.status).toBe("open");
    expect(JSON.stringify(runtime)).toBe(runtimeBefore);
    expect(JSON.stringify(recovered.effective)).toBe(effectiveBefore);
  });

  it("is deterministic and deep-equal for the same inputs", () => {
    const snapshot = freshSnapshot();
    const runtime = processAll(snapshot);
    const recovered = materialRecovery(snapshot, runtime);
    const input = {
      runtime,
      effective: recovered.effective,
      resolutionRecords: [recovered.resolution],
    };
    const a = computeEffectiveScores(input);
    const b = computeEffectiveScores(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(a.health)).toBe(JSON.stringify(b.health));
    expect(JSON.stringify(a.drift)).toBe(JSON.stringify(b.drift));
  });

  it("keeps unresolvedActionCount at 0 and does not mention decision state in Drift", () => {
    const { scores } = scoresAfterMaterialRecovery();
    expect(
      scores.drift.breakdown.some((line) => line.label.includes("unresolved action")),
    ).toBe(false);
    expect(JSON.stringify(scores.drift)).not.toMatch(/DecisionState|Verified|workflow/i);
  });
});

describe("Health ceiling", () => {
  it("enforces the existing 100 maximum when the bonus would exceed it", () => {
    const health = computeHealth({
      openIssues: [],
      affectedDownstreamTaskIds: [],
      unresolvedRecommendationCount: 0,
      provenResolvedIssueIds: ["issue-recovered"],
    });
    expect(HEALTH_MAX).toBe(100);
    expect(health.score).toBe(100);
    expect(health.breakdown).toEqual([
      {
        label: "Verified operational recovery (issue-recovered)",
        delta: 5,
        sourceEntityIds: ["issue-recovered"],
      },
    ]);
  });

  it("clamps effective scores at 100 when only a recovered issue remains", () => {
    const snapshot = freshSnapshot();
    const partial = processUntil(snapshot, "fixture-material-delay");
    const materialOnly: ReasoningRuntime = {
      ...partial,
      reasonings: partial.reasonings.filter(
        (r) => r.issue?.kind === "MaterialDeliveryDelayed",
      ),
    };
    const recovered = materialRecovery(snapshot, processAll(snapshot));
    const scores = computeEffectiveScores({
      runtime: materialOnly,
      effective: recovered.effective,
      resolutionRecords: [recovered.resolution],
    });
    expect(scores.effectiveOpenIssueIds).toEqual([]);
    expect(scores.currentlyResolvedIssueIds).toEqual([recovered.materialIssue.id]);
    expect(scores.health.score).toBe(100);
  });
});
