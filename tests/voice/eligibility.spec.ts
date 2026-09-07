import { readFileSync } from "node:fs";
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
import {
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
import type { AgentContext, AgentTimelineView } from "@/domain/agent/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import type { VoicePreferences } from "@/domain/voice";
import {
  evaluateVoiceEligibility,
  prepareReplayAnnouncement,
} from "@/lib/voice/eligibility";
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
  history: RecoveryRuntime["history"] = [],
  currentlyRecoveredIssueIds: readonly string[] = [],
  evaluationSimulatedAt?: string,
): RecoveryRuntime {
  const result = recomputeRecoveryRuntime({
    history: [...history],
    currentlyRecoveredIssueIds: [...currentlyRecoveredIssueIds],
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
  return {
    decisions,
    timeline,
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

function recoveredWorld() {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
  const recovery = mustRecovery(reasoning, overlay);
  return { snapshot, reasoning, overlay, recovery, ...contextFrom(reasoning, overlay, recovery) };
}

function fiveFixtureNoOverlayWorld() {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = initialOverlayRuntime(snapshot);
  const recovery = mustRecovery(reasoning, overlay);
  return { snapshot, reasoning, overlay, recovery, ...contextFrom(reasoning, overlay, recovery) };
}

function prefs(overrides: Partial<VoicePreferences> = {}): VoicePreferences {
  return { ...DEFAULT_VOICE_PREFERENCES, ...overrides };
}

function auto(context: AgentContext, entry: AgentTimelineView, announced: readonly string[] = []) {
  return evaluateVoiceEligibility({
    timelineEntry: entry,
    agentContext: context,
    preferences: prefs(),
    announcedEventIds: announced,
  });
}

function observation(context: AgentContext, signalId: string): AgentTimelineView {
  const entry = context.timeline.find(
    (item) => item.timelineEventId === `tl-obs-${signalId}`,
  );
  if (!entry) throw new Error(`missing observation for ${signalId}`);
  return entry;
}

function signalByType(context: AgentContext, type: AgentContext["signals"][number]["type"]) {
  const signal = context.signals.find((item) => item.type === type);
  if (!signal) throw new Error(`missing signal ${type}`);
  return signal;
}

function withSignalTier(
  context: AgentContext,
  signalId: string,
  finalTier: AgentContext["signals"][number]["finalTier"],
): AgentContext {
  return {
    ...context,
    signals: context.signals.map((item) =>
      item.signalId === signalId ? { ...item, finalTier } : item,
    ),
  };
}

function syntheticEntry(
  overrides: Partial<AgentTimelineView> & Pick<AgentTimelineView, "timelineEventId" | "source" | "label">,
): AgentTimelineView {
  return {
    summary: overrides.summary ?? overrides.label,
    simulatedAt: overrides.simulatedAt ?? EVALUATION_AT,
    facts: overrides.facts ?? [],
    ...overrides,
  };
}

describe("voice eligibility", () => {
  it("accepts a new Tier 1 signal when auto-announce is enabled", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const signal = signalByType(context, "InspectionMissing");
    expect(signal.finalTier).toBe("Tier1");
    const result = auto(context, observation(context, signal.signalId));
    expect(result.status).toBe("Eligible");
    if (result.status !== "Eligible") return;
    expect(result.announcement.kind).toBe("tier1Signal");
    expect(result.announcement.spokenAs).toBe("current");
    expect(result.announcement.id).toBe(
      `announce-${observation(context, signal.signalId).timelineEventId}`,
    );
    expect(result.announcement.relatedSignalIds).toContain(signal.signalId);
    expect(result.announcement.simulatedAt).toBe(
      observation(context, signal.signalId).simulatedAt,
    );
  });

  it("rejects Tier 2, Tier 3, and Tier 4 observation events", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const inspection = signalByType(context, "InspectionMissing");
    const delivery = signalByType(context, "DeliveryReceived");
    expect(delivery.finalTier).toBe("Tier4");

    const tier2 = auto(
      withSignalTier(context, inspection.signalId, "Tier2"),
      observation(context, inspection.signalId),
    );
    const tier3 = auto(
      withSignalTier(context, inspection.signalId, "Tier3"),
      observation(context, inspection.signalId),
    );
    const tier4 = auto(context, observation(context, delivery.signalId));

    expect(tier2).toEqual({
      status: "NotEligible",
      reason: "NotTier1",
      announcement: null,
    });
    expect(tier3).toEqual({
      status: "NotEligible",
      reason: "NotTier1",
      announcement: null,
    });
    expect(tier4).toEqual({
      status: "NotEligible",
      reason: "NotTier1",
      announcement: null,
    });
  });

  it("skips when voice is disabled, muted, or Tier 1 auto-announce is off", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const signal = signalByType(context, "InspectionMissing");
    const entry = observation(context, signal.signalId);
    const input = {
      timelineEntry: entry,
      agentContext: context,
      announcedEventIds: [] as const,
    };
    expect(
      evaluateVoiceEligibility({ ...input, preferences: prefs({ enabled: false }) }),
    ).toMatchObject({ status: "NotEligible", reason: "VoiceDisabled" });
    expect(
      evaluateVoiceEligibility({ ...input, preferences: prefs({ muted: true }) }),
    ).toMatchObject({ status: "NotEligible", reason: "VoiceMuted" });
    expect(
      evaluateVoiceEligibility({
        ...input,
        preferences: prefs({ autoAnnounceTier1: false }),
      }),
    ).toMatchObject({ status: "NotEligible", reason: "AutoAnnounceTier1Disabled" });
  });

  it("skips a duplicate timeline event id", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const signal = signalByType(context, "InspectionMissing");
    const entry = observation(context, signal.signalId);
    const first = auto(context, entry);
    expect(first.status).toBe("Eligible");
    const second = auto(context, entry, [entry.timelineEventId]);
    expect(second).toEqual({
      status: "AlreadyAnnounced",
      timelineEventId: entry.timelineEventId,
      announcement: null,
    });
  });

  it("accepts committed operational recovery and reopen events", () => {
    const recovered = recoveredWorld();
    const recoveryEntry = recovered.context.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational recovery proven",
    );
    expect(recoveryEntry).toBeTruthy();
    const recoveryResult = auto(recovered.context, recoveryEntry!);
    expect(recoveryResult.status).toBe("Eligible");
    if (recoveryResult.status !== "Eligible") return;
    expect(recoveryResult.announcement.kind).toBe("recoveryProven");
    expect(recoveryResult.announcement.id).toBe(
      `announce-${recoveryEntry!.timelineEventId}`,
    );
    const recoveryWithoutTier1Auto = evaluateVoiceEligibility({
      timelineEntry: recoveryEntry!,
      agentContext: recovered.context,
      preferences: prefs({ autoAnnounceTier1: false }),
      announcedEventIds: [],
    });
    expect(recoveryWithoutTier1Auto.status).toBe("Eligible");

    const snapshot = recovered.snapshot;
    const reopenedRecovery = recomputeRecoveryRuntime({
      history: recovered.recovery.history,
      currentlyRecoveredIssueIds: recovered.recovery.currentlyRecoveredIssueIds,
      reasoning: recovered.reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    if (!reopenedRecovery.ok) throw new Error(reopenedRecovery.error.code);
    const reopened = contextFrom(
      recovered.reasoning,
      {
        ...recovered.overlay,
        effective: createEffectiveProjectSnapshot(snapshot),
      },
      reopenedRecovery.runtime,
    );
    const reopenEntry = reopened.context.timeline.find(
      (item) => item.source === "recovery" && item.label === "Operational issue reopened",
    );
    expect(reopenEntry).toBeTruthy();
    const reopenResult = auto(reopened.context, reopenEntry!);
    expect(reopenResult.status).toBe("Eligible");
    if (reopenResult.status !== "Eligible") return;
    expect(reopenResult.announcement.kind).toBe("issueReopened");
    expect(reopenResult.announcement.id).toBe(`announce-${reopenEntry!.timelineEventId}`);
  });

  it("rejects workflow, recommendation, overlay, score, and Agent Chat rows", () => {
    const { context } = recoveredWorld();
    const recommendation = context.timeline.find((item) => item.label === "Recommendation");
    const overlay = context.timeline.find((item) => item.source === "overlay");
    const score = context.timeline.find((item) => item.source === "score");
    expect(recommendation).toBeTruthy();
    expect(overlay).toBeTruthy();
    expect(score).toBeTruthy();

    const cases: AgentTimelineView[] = [
      recommendation!,
      overlay!,
      score!,
      syntheticEntry({
        timelineEventId: "audit-approve-1",
        source: "decision",
        label: "Approved",
      }),
      syntheticEntry({
        timelineEventId: "audit-execute-1",
        source: "decision",
        label: "Execution recorded",
      }),
      syntheticEntry({
        timelineEventId: "audit-verify-1",
        source: "decision",
        label: "Verification succeeded",
      }),
      syntheticEntry({
        timelineEventId: "user-msg-1",
        source: "reasoning",
        label: "Agent Chat",
        summary: "What happened?",
      }),
    ];

    for (const entry of cases) {
      expect(auto(context, entry), entry.label).toEqual({
        status: "NotEligible",
        reason: "NotVoiceKind",
        announcement: null,
      });
    }
  });

  it("is deterministic and does not mutate context or timeline", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const signal = signalByType(context, "InspectionMissing");
    const entry = observation(context, signal.signalId);
    const contextBefore = structuredClone(context);
    const entryBefore = structuredClone(entry);
    const first = auto(context, entry);
    const second = auto(context, entry);
    expect(first).toEqual(second);
    expect(context).toEqual(contextBefore);
    expect(entry).toEqual(entryBefore);
  });

  it("skips stale auto-announce for a recovered Tier 1 and keeps replay identity", () => {
    const { context } = fiveFixtureNoOverlayWorld();
    const signal = signalByType(context, "InspectionMissing");
    const issue = context.openIssues.find((item) => item.signalId === signal.signalId);
    expect(issue).toBeTruthy();
    const staleContext: AgentContext = {
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
    const entry = observation(staleContext, signal.signalId);
    expect(auto(staleContext, entry)).toMatchObject({
      status: "NotEligible",
      reason: "StaleForAuto",
    });
    const replay = prepareReplayAnnouncement({
      timelineEntry: entry,
      agentContext: staleContext,
    });
    expect(replay.status).toBe("Eligible");
    if (replay.status !== "Eligible") return;
    expect(replay.announcement.spokenAs).toBe("historical");
    expect(replay.announcement.id).toBe(`announce-${entry.timelineEventId}`);
    expect(replay.announcement.timelineEventId).toBe(entry.timelineEventId);
  });

  it("contains no SpeechSynthesis, stores, timers, or explainer imports", () => {
    for (const file of [
      "domain/voice/types.ts",
      "domain/voice/index.ts",
      "lib/voice/eligibility.ts",
      "lib/voice/announcementText.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      for (const token of [
        "Date.now(",
        "Math.random(",
        "randomUUID",
        "crypto.randomUUID",
        "setTimeout(",
        "setInterval(",
        "SpeechSynthesis",
        "SpeechSynthesisUtterance",
        "speechSynthesis",
        "openai",
        "anthropic",
        "process.env",
        "fetch(",
        "useAgentStore",
        "AgentExplainer",
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
