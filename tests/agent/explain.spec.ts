import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { AgentContext, AgentResponse } from "@/domain/agent/types";
import { mockExplainer } from "@/lib/agent/explain";
import { unavailableLlmExplainer } from "@/lib/agent/explainer";
import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import {
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions";
import {
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects";
import {
  initialRecoveryRuntime,
  recomputeRecoveryRuntime,
} from "@/domain/recovery";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { freshSnapshot } from "@/tests/engines/helpers";

const EVALUATION_AT = "2026-03-14T10:30:00.000Z";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function mustRecovery(
  reasoning: ReasoningRuntime,
  overlay: OverlayRuntime,
): RecoveryRuntime {
  const result = recomputeRecoveryRuntime({
    history: [],
    currentlyRecoveredIssueIds: [],
    reasoning,
    effective: overlay.effective,
    evaluationSimulatedAt: EVALUATION_AT,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.runtime;
}

function recoveredContext(): {
  context: AgentContext;
  reasoning: ReasoningRuntime;
} {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
  const recovery = mustRecovery(reasoning, overlay);
  const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
  const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
    effectHistory: overlay.effectHistory,
    applicationResults: overlay.applicationResults,
    recoveryHistory: recovery.history,
  });
  return {
    reasoning,
    context: buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt: EVALUATION_AT,
      timeline,
    }),
  };
}

function explain(question: string, context: AgentContext): AgentResponse {
  return mockExplainer.explain(question, context, { id: "agent-msg-2" });
}

function assertEvidenceInContext(response: AgentResponse, context: AgentContext) {
  const known = new Set<string>();
  for (const item of context.openIssues) known.add(item.issueId);
  for (const item of context.currentlyRecoveredIssues) known.add(item.issueId);
  for (const item of context.signals) {
    known.add(item.signalId);
    known.add(item.relatedEntityId);
  }
  for (const item of context.recommendations) {
    known.add(item.recommendationId);
    for (const evidence of item.evidence) known.add(evidence.entityId);
  }
  for (const item of context.decisions) known.add(item.decisionId);
  for (const item of context.changedFacts) known.add(item.entityId);
  for (const item of context.recoveryHistory) known.add(item.eventId);
  for (const item of context.timeline) known.add(item.timelineEventId);
  for (const ref of response.evidenceRefs) {
    expect(known.has(ref.entityId), `unknown evidence id ${ref.entityId}`).toBe(true);
  }
}

describe("mock explainer", () => {
  it("answers What happened? from the committed timeline", () => {
    const { context } = recoveredContext();
    const response = explain("What happened?", context);
    expect(response.grounding).toBe("grounded");
    expect(response.answerText.length).toBeGreaterThan(0);
    expect(response.relatedTimelineEventIds.length).toBeGreaterThan(0);
    expect(response.generatedAtSimulated).toBe(EVALUATION_AT);
    assertEvidenceInContext(response, context);
  });

  it("answers blocker questions from currently active issues", () => {
    const { context } = recoveredContext();
    const response = explain("What is blocking the slab pour?", context);
    expect(response.grounding).toBe("grounded");
    const active = context.openIssues.filter((item) => !item.currentlyRecovered);
    for (const issue of active) {
      expect(response.relatedIssueIds).toContain(issue.issueId);
    }
    const recovered = context.currentlyRecoveredIssues[0];
    if (recovered) {
      expect(response.answerText).not.toMatch(new RegExp(`${recovered.issueId}.*currently active`));
    }
    assertEvidenceInContext(response, context);
  });

  it("explains Tier 1 from committed signal evidence", () => {
    const { context } = recoveredContext();
    const response = explain("Why is this Tier 1?", context);
    expect(response.grounding).toBe("grounded");
    const tier1 = context.signals.find((item) => item.finalTier === "Tier1");
    expect(tier1).toBeTruthy();
    expect(response.relatedSignalIds).toContain(tier1!.signalId);
    expect(response.answerText).toContain("Tier1");
    assertEvidenceInContext(response, context);
  });

  it("What should I do next? returns a committed recommendation only", () => {
    const { context } = recoveredContext();
    const response = explain("What should I do next?", context);
    expect(response.grounding).toBe("grounded");
    expect(response.relatedRecommendationIds.length).toBeGreaterThan(0);
    const rec = context.recommendations.find(
      (item) => item.recommendationId === response.relatedRecommendationIds[0],
    );
    expect(rec).toBeTruthy();
    expect(response.answerText).toContain(rec!.primaryAction);
    expect(response.answerText).toContain("existing recommendation");
    const invented = context.recommendations.every(
      (item) => !response.answerText.includes(item.primaryAction),
    );
    expect(invented).toBe(false);
    assertEvidenceInContext(response, context);
  });

  it("uses effective Health and Drift without claiming full project recovery", () => {
    const { context, reasoning } = recoveredContext();
    expect(context.health.score).toBe(41);
    expect(context.drift.score).toBe(95);
    const health = explain("Why is Health red?", context);
    const drift = explain("What is Drift?", context);
    expect(health.grounding).toBe("grounded");
    expect(drift.grounding).toBe("grounded");
    expect(health.answerText).toContain("41");
    expect(health.answerText).toContain("red");
    expect(health.answerText).toMatch(/1 blocker recovered/i);
    expect(health.answerText).toMatch(/other active risks remain/i);
    expect(health.answerText.toLowerCase()).toContain("not full project recovery");
    expect(drift.answerText).toContain("95");
    expect(drift.answerText).toContain("Critical Drift");
    expect(reasoning.health.score).toBe(11);
    assertEvidenceInContext(health, context);
    assertEvidenceInContext(drift, context);
  });

  it("current recovery ignores reopened historical episodes", () => {
    const { context } = recoveredContext();
    const recovered = context.currentlyRecoveredIssues[0];
    expect(recovered).toBeTruthy();
    const current = explain("What recovered?", context);
    expect(current.grounding).toBe("grounded");
    expect(current.relatedIssueIds).toContain(recovered!.issueId);

    const reopened: AgentContext = {
      ...context,
      currentlyRecoveredIssues: [],
      recoverySummary: {
        ...context.recoverySummary,
        currentlyRecoveredCount: 0,
        currentlyOpenCount: context.openIssues.length,
        currentlyReopenedCount: 1,
      },
      openIssues: context.openIssues.map((issue) => ({
        ...issue,
        currentlyRecovered: false,
      })),
      recoveryHistory: [
        ...context.recoveryHistory,
        {
          eventId: `reopen-${recovered!.issueId}-VERIFY_MATERIAL_REQUIREMENT-episode-1`,
          type: "Reopened",
          issueId: recovered!.issueId,
          verificationRuleId: recovered!.verificationRuleId ?? "VERIFY_MATERIAL_REQUIREMENT",
          episodeNumber: 1,
          simulatedAt: "2026-03-20T00:00:00.000Z",
          evidence: [],
        },
      ],
    };
    const afterReopen = explain("What recovered?", reopened);
    expect(afterReopen.grounding).toBe("grounded");
    expect(afterReopen.relatedIssueIds).not.toContain(recovered!.issueId);
    expect(afterReopen.answerText.toLowerCase()).toContain("no issues are currently recovered");
  });

  it("unresolved explanation lists currently open issues", () => {
    const { context } = recoveredContext();
    const response = explain("What is still unresolved?", context);
    const active = context.openIssues.filter((item) => !item.currentlyRecovered);
    expect(response.grounding).toBe("grounded");
    expect([...response.relatedIssueIds].sort()).toEqual(
      active.map((item) => item.issueId).sort(),
    );
    assertEvidenceInContext(response, context);
  });

  it("material delivery explanation uses overlay changed facts", () => {
    const { context } = recoveredContext();
    const response = explain("What changed after the material delivery?", context);
    expect(response.grounding).toBe("grounded");
    const material = context.changedFacts.find((fact) => fact.entityType === "material");
    expect(material).toBeTruthy();
    expect(response.answerText).toContain(material!.entityId);
    expect(response.answerText).toContain(material!.newValue);
    assertEvidenceInContext(response, context);
  });

  it("recommendation evidence returns real evidence ids", () => {
    const { context } = recoveredContext();
    const response = explain("What evidence supports this recommendation?", context);
    expect(response.grounding).toBe("grounded");
    expect(response.evidenceRefs.length).toBeGreaterThan(0);
    const rec = context.recommendations.find(
      (item) => item.recommendationId === response.relatedRecommendationIds[0],
    );
    expect(rec).toBeTruthy();
    for (const ref of response.evidenceRefs) {
      expect(rec!.evidence.some((item) => item.entityId === ref.entityId)).toBe(true);
    }
  });

  it("decision status uses current decision context and separates verifications", () => {
    const { context } = recoveredContext();
    const response = explain("What is the current decision status?", context);
    expect(response.grounding).toBe("grounded");
    expect(response.relatedDecisionIds).toEqual(
      context.decisions.map((item) => item.decisionId),
    );
    expect(response.answerText.toLowerCase()).toContain("workflow verification");
    expect(response.answerText.toLowerCase()).toContain("operational recovery");
    assertEvidenceInContext(response, context);
  });

  it("recovery timeline uses context history and timeline", () => {
    const { context } = recoveredContext();
    const response = explain("What does the recovery timeline show?", context);
    expect(response.grounding).toBe("grounded");
    expect(response.answerText).toContain("Recovered");
    expect(response.relatedTimelineEventIds.length).toBeGreaterThan(0);
    assertEvidenceInContext(response, context);
  });

  it("unsupported questions invent no evidence or related ids", () => {
    const { context } = recoveredContext();
    const response = explain("What will the weather be tomorrow on the internet?", context);
    expect(response.grounding).toBe("unsupported");
    expect(response.unsupportedReason).toBeTruthy();
    expect(response.evidenceRefs).toEqual([]);
    expect(response.relatedSignalIds).toEqual([]);
    expect(response.relatedIssueIds).toEqual([]);
    expect(response.relatedRecommendationIds).toEqual([]);
    expect(response.relatedDecisionIds).toEqual([]);
    expect(response.relatedTimelineEventIds).toEqual([]);
  });

  it("unavailable LLM adapter returns grounding unavailable without network", () => {
    const snapshot = freshSnapshot();
    const reasoning = initialRuntime();
    const overlay = initialOverlayRuntime(snapshot);
    const recovery = initialRecoveryRuntime(snapshot);
    const context = buildAgentContext({
      reasoning,
      decisions: initialDecisionRuntime(),
      overlay,
      recovery,
      evaluationSimulatedAt: EVALUATION_AT,
      timeline: [],
    });
    const response = unavailableLlmExplainer.explain("What happened?", context, {
      id: "agent-msg-2",
    });
    expect(response.grounding).toBe("unavailable");
    expect(response.unsupportedReason).toMatch(/not enabled/i);
    expect(response.evidenceRefs).toEqual([]);
  });

  it("identical question and context produce equivalent content", () => {
    const { context } = recoveredContext();
    const a = mockExplainer.explain("What recovered?", context, { id: "agent-msg-2" });
    const b = mockExplainer.explain("What recovered?", context, { id: "agent-msg-4" });
    expect(a.answerText).toBe(b.answerText);
    expect(a.grounding).toBe(b.grounding);
    expect(a.evidenceRefs).toEqual(b.evidenceRefs);
    expect(a.id).toBe("agent-msg-2");
    expect(b.id).toBe("agent-msg-4");
  });

  it("does not mutate AgentContext", () => {
    const { context } = recoveredContext();
    const before = structuredClone(context);
    explain("What happened?", context);
    expect(context).toEqual(before);
  });

  it("contains no LLM, voice, timers, or env access in production explainer code", () => {
    for (const file of ["lib/agent/explain.ts", "lib/agent/explainer.ts"]) {
      const source = readFileSync(file, "utf8");
      for (const token of [
        "Date.now(",
        "Math.random(",
        "randomUUID",
        "crypto.randomUUID",
        "setTimeout(",
        "setInterval(",
        "SpeechSynthesis",
        "speechSynthesis",
        "openai",
        "anthropic",
        "process.env",
        "fetch(",
        "useReasoningStore",
        "useDecisionStore",
        "useOverlayStore",
        "useRecoveryStore",
      ]) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });
});
