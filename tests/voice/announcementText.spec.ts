import { describe, expect, it } from "vitest";

import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import {
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions";
import {
  createEffectiveProjectSnapshot,
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects";
import { recomputeRecoveryRuntime } from "@/domain/recovery";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { AgentContext, AgentTimelineView } from "@/domain/agent/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import {
  evaluateVoiceEligibility,
  prepareReplayAnnouncement,
} from "@/lib/voice/eligibility";
import {
  voiceAnnouncementId,
  voiceAnnouncementText,
} from "@/lib/voice/announcementText";
import { freshSnapshot } from "@/tests/engines/helpers";

const EVALUATION_AT = "2026-03-14T10:30:00.000Z";
const T_REOPEN = "2026-03-20T00:00:00.000Z";

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
  previous?: RecoveryRuntime,
  evaluationSimulatedAt?: string,
): RecoveryRuntime {
  const result = recomputeRecoveryRuntime({
    history: previous ? [...previous.history] : [],
    currentlyRecoveredIssueIds: previous
      ? [...previous.currentlyRecoveredIssueIds]
      : [],
    reasoning,
    effective: overlay.effective,
    evaluationSimulatedAt,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.runtime;
}

function contextFrom(
  reasoning: ReasoningRuntime,
  overlay: OverlayRuntime,
  recovery: RecoveryRuntime,
) {
  const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
  const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
    effectHistory: overlay.effectHistory,
    applicationResults: overlay.applicationResults,
    recoveryHistory: recovery.history,
  });
  return buildAgentContext({
    reasoning,
    decisions,
    overlay,
    recovery,
    evaluationSimulatedAt: EVALUATION_AT,
    timeline,
  });
}

function recoveredWorld() {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
  const recovery = mustRecovery(reasoning, overlay);
  return {
    snapshot,
    reasoning,
    overlay,
    recovery,
    context: contextFrom(reasoning, overlay, recovery),
  };
}

function fiveFixtureWorld() {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = initialOverlayRuntime(snapshot);
  const recovery = mustRecovery(reasoning, overlay);
  return { context: contextFrom(reasoning, overlay, recovery) };
}

function observation(context: AgentContext, signalId: string): AgentTimelineView {
  const entry = context.timeline.find(
    (item) => item.timelineEventId === `tl-obs-${signalId}`,
  );
  if (!entry) throw new Error(`missing observation for ${signalId}`);
  return entry;
}

function assertIdsInContext(context: AgentContext, related: {
  relatedSignalIds: readonly string[];
  relatedIssueIds: readonly string[];
}) {
  const signals = new Set(context.signals.map((item) => item.signalId));
  const issues = new Set([
    ...context.openIssues.map((item) => item.issueId),
    ...context.currentlyRecoveredIssues.map((item) => item.issueId),
  ]);
  for (const id of related.relatedSignalIds) expect(signals.has(id)).toBe(true);
  for (const id of related.relatedIssueIds) expect(issues.has(id)).toBe(true);
}

function assertNoRecommendation(context: AgentContext, text: string) {
  for (const rec of context.recommendations) {
    expect(text.includes(rec.primaryAction)).toBe(false);
  }
  expect(text.toLowerCase()).not.toContain("recommend");
}

describe("voice announcement text", () => {
  it("uses current structured Tier 1 state and a deterministic id", () => {
    const { context } = fiveFixtureWorld();
    const signal = context.signals.find((item) => item.type === "InspectionMissing");
    expect(signal).toBeTruthy();
    const entry = observation(context, signal!.signalId);
    const before = structuredClone(context);
    const entryBefore = structuredClone(entry);
    const result = evaluateVoiceEligibility({
      timelineEntry: entry,
      agentContext: context,
      preferences: DEFAULT_VOICE_PREFERENCES,
      announcedEventIds: [],
    });
    expect(result.status).toBe("Eligible");
    if (result.status !== "Eligible") return;
    expect(result.announcement.id).toBe(voiceAnnouncementId(entry.timelineEventId));
    expect(result.announcement.text).toContain("Tier 1 signal");
    expect(result.announcement.text).toContain("Inspection Missing");
    expect(result.announcement.text).toContain(signal!.relatedTaskId);
    expect(result.announcement.text.toLowerCase()).not.toContain("currently blocking");
    assertNoRecommendation(context, result.announcement.text);
    assertIdsInContext(context, result.announcement);
    expect(context).toEqual(before);
    expect(entry).toEqual(entryBefore);
  });

  it("frames a recovered Tier 1 replay as historical", () => {
    const { context } = fiveFixtureWorld();
    const signal = context.signals.find((item) => item.finalTier === "Tier1");
    expect(signal).toBeTruthy();
    const issue = context.openIssues.find((item) => item.signalId === signal!.signalId);
    expect(issue).toBeTruthy();
    const stale: AgentContext = {
      ...context,
      openIssues: context.openIssues.map((item) =>
        item.issueId === issue!.issueId ? { ...item, currentlyRecovered: true } : item,
      ),
      currentlyRecoveredIssues: [
        ...context.currentlyRecoveredIssues,
        {
          issueId: issue!.issueId,
          signalId: issue!.signalId,
          verificationRuleId: null,
          currentlyRecovered: true,
          latestEpisodeNumber: 1,
          latestRecoveredSimulatedAt: EVALUATION_AT,
        },
      ],
    };
    const replay = prepareReplayAnnouncement({
      timelineEntry: observation(stale, signal!.signalId),
      agentContext: stale,
    });
    expect(replay.status).toBe("Eligible");
    if (replay.status !== "Eligible") return;
    expect(replay.announcement.spokenAs).toBe("historical");
    expect(replay.announcement.text).toContain("has since recovered");
    expect(replay.announcement.text.toLowerCase()).not.toContain("currently blocking");
    expect(replay.announcement.id).toBe(
      voiceAnnouncementId(observation(stale, signal!.signalId).timelineEventId),
    );
  });

  it("does not claim current recovery after a reopen, and frames later recovery historically", () => {
    const recovered = recoveredWorld();
    const recoveryEntry = recovered.context.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational recovery proven",
    );
    expect(recoveryEntry).toBeTruthy();

    const reopenedRuntime = recomputeRecoveryRuntime({
      history: recovered.recovery.history,
      currentlyRecoveredIssueIds: recovered.recovery.currentlyRecoveredIssueIds,
      reasoning: recovered.reasoning,
      effective: createEffectiveProjectSnapshot(recovered.snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    if (!reopenedRuntime.ok) throw new Error(reopenedRuntime.error.code);
    const reopenedOverlay = {
      ...recovered.overlay,
      effective: createEffectiveProjectSnapshot(recovered.snapshot),
    };
    const reopenedContext = contextFrom(
      recovered.reasoning,
      reopenedOverlay,
      reopenedRuntime.runtime,
    );
    const recoveredAfterReopen = prepareReplayAnnouncement({
      timelineEntry: recoveryEntry!,
      agentContext: reopenedContext,
    });
    expect(recoveredAfterReopen.status).toBe("Eligible");
    if (recoveredAfterReopen.status !== "Eligible") return;
    expect(recoveredAfterReopen.announcement.spokenAs).toBe("historical");
    expect(recoveredAfterReopen.announcement.text).toContain("active again");
    expect(recoveredAfterReopen.announcement.text.toLowerCase()).not.toContain(
      "currently recovered",
    );
    expect(recoveredAfterReopen.announcement.text.toLowerCase()).not.toContain(
      "project recovered",
    );

    const second = mustRecovery(
      recovered.reasoning,
      syncOverlayFromReasoning(initialOverlayRuntime(recovered.snapshot), recovered.reasoning),
      reopenedRuntime.runtime,
    );
    const secondContext = contextFrom(
      recovered.reasoning,
      syncOverlayFromReasoning(initialOverlayRuntime(recovered.snapshot), recovered.reasoning),
      second,
    );
    const reopenEntry = secondContext.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational issue reopened",
    );
    expect(reopenEntry).toBeTruthy();
    const historicalReopen = prepareReplayAnnouncement({
      timelineEntry: reopenEntry!,
      agentContext: secondContext,
    });
    expect(historicalReopen.status).toBe("Eligible");
    if (historicalReopen.status !== "Eligible") return;
    expect(historicalReopen.announcement.spokenAs).toBe("historical");
    expect(historicalReopen.announcement.text).toContain("reopened previously");
    expect(historicalReopen.announcement.text).toContain("has since recovered again");
    expect(historicalReopen.announcement.id).toBe(
      voiceAnnouncementId(reopenEntry!.timelineEventId),
    );
  });

  it("recovery text notes remaining risks and never invents a recommendation", () => {
    const { context } = recoveredWorld();
    const recoveryEntry = context.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational recovery proven",
    );
    expect(recoveryEntry).toBeTruthy();
    const result = evaluateVoiceEligibility({
      timelineEntry: recoveryEntry!,
      agentContext: context,
      preferences: DEFAULT_VOICE_PREFERENCES,
      announcedEventIds: [],
    });
    expect(result.status).toBe("Eligible");
    if (result.status !== "Eligible") return;
    expect(result.announcement.text).toMatch(/blocker recovered/i);
    expect(result.announcement.text).toContain("Other active project risks remain");
    expect(result.announcement.text.toLowerCase()).not.toContain("project recovered");
    expect(result.announcement.text.toLowerCase()).not.toContain("health is green");
    expect(result.announcement.text.toLowerCase()).not.toContain("full project recovery");
    assertNoRecommendation(context, result.announcement.text);
    assertIdsInContext(context, result.announcement);
  });

  it("reopen text identifies the renewed blocker without an action", () => {
    const recovered = recoveredWorld();
    const reopenedRuntime = recomputeRecoveryRuntime({
      history: recovered.recovery.history,
      currentlyRecoveredIssueIds: recovered.recovery.currentlyRecoveredIssueIds,
      reasoning: recovered.reasoning,
      effective: createEffectiveProjectSnapshot(recovered.snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    if (!reopenedRuntime.ok) throw new Error(reopenedRuntime.error.code);
    const context = contextFrom(
      recovered.reasoning,
      {
        ...recovered.overlay,
        effective: createEffectiveProjectSnapshot(recovered.snapshot),
      },
      reopenedRuntime.runtime,
    );
    const reopenEntry = context.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational issue reopened",
    );
    expect(reopenEntry).toBeTruthy();
    const result = evaluateVoiceEligibility({
      timelineEntry: reopenEntry!,
      agentContext: context,
      preferences: DEFAULT_VOICE_PREFERENCES,
      announcedEventIds: [],
    });
    expect(result.status).toBe("Eligible");
    if (result.status !== "Eligible") return;
    expect(result.announcement.kind).toBe("issueReopened");
    expect(result.announcement.spokenAs).toBe("current");
    expect(result.announcement.text).toMatch(/reopened/i);
    expect(result.announcement.text).toContain("requires attention again");
    assertNoRecommendation(context, result.announcement.text);
    assertIdsInContext(context, result.announcement);
  });

  it("template helpers stay deterministic and omit absent facts", () => {
    expect(
      voiceAnnouncementText({
        kind: "tier1Signal",
        spokenAs: "current",
        signalType: "WeatherAlert",
        relatedTaskId: null,
        issueKind: null,
      }),
    ).toBe("Tier 1 signal. Weather Alert.");
    expect(
      voiceAnnouncementText({
        kind: "recoveryProven",
        spokenAs: "current",
        issueId: "issue-1",
        issueKind: null,
        otherActiveRisksRemain: false,
      }),
    ).toBe("Issue issue-1 recovered. No other currently active blockers remain.");
  });
});
