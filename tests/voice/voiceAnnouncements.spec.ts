import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentContext } from "@/domain/agent/types";
import { createEffectiveProjectSnapshot } from "@/domain/effects";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import { askPulseBuildAgent } from "@/lib/orchestration/agentChat";
import {
  approveDecisionCommitted,
  ensureCommandCenterInitialized,
  executeDecisionCommitted,
  processNextObservationCommitted,
  resetCommandCenter,
  verifyDecisionCommitted,
} from "@/lib/orchestration/commandCenter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import {
  announceEligibleNewEvents,
  announceNewlyCommittedEvents,
  readCurrentAgentContext,
  replayLastEligibleAnnouncement,
  snapshotTimelineEventIds,
} from "@/lib/orchestration/voiceAnnouncements";
import {
  resetSpeechHost,
  setSpeechHost,
  type SpeechHost,
  type SpeechHostUtterance,
  type SpeechHostVoice,
} from "@/lib/voice/speechAdapter";
import { useAgentStore } from "@/store/useAgentStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";
import { useVoiceStore } from "@/store/useVoiceStore";

const T_REOPEN = "2026-03-20T00:00:00.000Z";
const T_RECOVER_AGAIN = "2026-03-21T00:00:00.000Z";

function voice(
  partial: Partial<SpeechHostVoice> & Pick<SpeechHostVoice, "voiceURI" | "name">,
): SpeechHostVoice {
  return {
    lang: "en-US",
    localService: true,
    default: false,
    ...partial,
  };
}

function createFakeHost(
  voices: SpeechHostVoice[],
  onSpeak?: (utterance: SpeechHostUtterance) => void,
) {
  const spoken: SpeechHostUtterance[] = [];
  let cancelled = 0;
  const host: SpeechHost = {
    getVoices: () => voices,
    speak: (utterance) => {
      onSpeak?.(utterance);
      spoken.push({ ...utterance });
    },
    cancel: () => {
      cancelled += 1;
    },
  };
  return { host, spoken, cancelledCount: () => cancelled };
}

function resetVoiceStore() {
  useVoiceStore.setState({
    preferences: { ...DEFAULT_VOICE_PREFERENCES },
    announcedEventIds: [],
    lastAnnouncement: null,
    voices: [],
    speechAvailable: false,
    speaking: false,
  });
}

function resetOperationalStores() {
  useAgentStore.getState().clearHistory();
  useProjectStore.setState({ snapshot: null, isLoaded: false });
  useReasoningStore.setState({
    isInitialized: false,
    runtime: useReasoningStore.getState().runtime,
    canProcessNext: true,
  });
  useReasoningStore.getState().resetReasoning();
  useReasoningStore.setState({ isInitialized: false });
  useDecisionStore.getState().resetDecisions();
  useOverlayStore.setState({ runtime: null });
  useRecoveryStore.setState({ runtime: null });
  useSimulatedClockStore.setState({ clock: null });
  useUIStore.getState().closeSignal();
}

function requireContext(): AgentContext {
  const context = readCurrentAgentContext();
  if (!context) throw new Error("AgentContext unavailable");
  return context;
}

function requireClockInstant(): string {
  const clock = useSimulatedClockStore.getState().clock;
  if (!clock) throw new Error("clock missing");
  return currentSimulatedAt(clock);
}

function processUntil(signalType: string): void {
  for (let i = 0; i < 8; i += 1) {
    const already = useReasoningStore
      .getState()
      .runtime.reasonings.some((entry) => entry.signal.type === signalType);
    if (already) return;
    const result = processNextObservationCommitted();
    if (!result.ok) throw new Error(`stopped before ${signalType}`);
  }
  throw new Error(`missing ${signalType}`);
}

function processAllObservations(): void {
  while (true) {
    const result = processNextObservationCommitted();
    if (!result.ok) break;
  }
}

function firstMutatingPendingApprovalId(): string {
  const decision = useDecisionStore
    .getState()
    .runtime.decisions.find(
      (item) =>
        item.state === "PendingReview" &&
        item.approvalRequired &&
        item.mutatesOperationalState,
    );
  if (!decision) throw new Error("no mutating pending approval decision");
  return decision.id;
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

function observationId(signalId: string): string {
  return `tl-obs-${signalId}`;
}

function operationalFingerprint() {
  return {
    reasoning: structuredClone(useReasoningStore.getState().runtime),
    decisions: structuredClone(useDecisionStore.getState().runtime),
    overlay: structuredClone(useOverlayStore.getState().runtime),
    recovery: structuredClone(useRecoveryStore.getState().runtime),
    snapshot: JSON.stringify(useProjectStore.getState().snapshot),
    clock: structuredClone(useSimulatedClockStore.getState().clock),
    agent: structuredClone(useAgentStore.getState().messages),
  };
}

describe("Phase 4F synchronized voice announcements", () => {
  let fake: ReturnType<typeof createFakeHost>;
  let committedBeforeSpeak: string[];

  beforeEach(() => {
    resetOperationalStores();
    resetVoiceStore();
    committedBeforeSpeak = [];
    fake = createFakeHost(
      [voice({ voiceURI: "uri-daniel", name: "Daniel", default: true })],
      () => {
        committedBeforeSpeak = [
          ...useReasoningStore.getState().runtime.processedFixtureIds,
        ];
      },
    );
    setSpeechHost(fake.host);
    useVoiceStore.getState().initializeVoices();
  });

  afterEach(() => {
    resetSpeechHost();
    resetVoiceStore();
    resetOperationalStores();
  });

  it("auto-announces a committed Tier 1 Process Next observation once after runtime state exists", () => {
    ensureCommandCenterInitialized();
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toEqual([]);
    const result = processNextObservationCommitted();
    expect(result.ok).toBe(true);
    expect(committedBeforeSpeak).toEqual(["fixture-weather-alert"]);
    expect(fake.spoken).toHaveLength(1);
    expect(fake.spoken[0]?.text.startsWith("Tier 1 signal.")).toBe(true);
    expect(fake.spoken[0]?.text.includes("fixture-weather-alert")).toBe(false);
    const context = requireContext();
    const weather = context.signals.find((item) => item.type === "WeatherAlert");
    expect(weather?.finalTier).toBe("Tier1");
    expect(useVoiceStore.getState().announcedEventIds).toEqual([
      observationId(weather!.signalId),
    ]);
    expect(useVoiceStore.getState().lastAnnouncement?.kind).toBe("tier1Signal");
    expect(useVoiceStore.getState().lastAnnouncement?.id).toBe(
      `announce-${observationId(weather!.signalId)}`,
    );
    const silent = context.timeline.filter(
      (item) =>
        item.label === "Recommendation" ||
        item.label === "Analysis" ||
        item.source === "score",
    );
    expect(silent.length).toBeGreaterThan(0);
    for (const entry of silent) {
      expect(useVoiceStore.getState().announcedEventIds).not.toContain(
        entry.timelineEventId,
      );
    }
  });

  it("does not auto-announce Tier 2 or Tier 3 observations", () => {
    ensureCommandCenterInitialized();
    useVoiceStore.getState().setMuted(true);
    expect(processNextObservationCommitted().ok).toBe(true);
    useVoiceStore.getState().setMuted(false);
    const context = requireContext();
    const weather = context.signals.find((item) => item.type === "WeatherAlert");
    expect(weather).toBeTruthy();
    const spoken: string[] = [];
    const recorded: string[] = [];
    for (const tier of ["Tier2", "Tier3"] as const) {
      const result = announceEligibleNewEvents({
        context: withSignalTier(context, weather!.signalId, tier),
        previousEventIds: [],
        preferences: useVoiceStore.getState().preferences,
        announcedEventIds: [],
        speak: (announcement) => {
          spoken.push(announcement.text);
          return {
            ok: true,
            spoken: true,
            voiceURI: "uri-daniel",
            fallback: "default",
            announcementId: announcement.id,
          };
        },
        record: (id) => recorded.push(id),
      });
      expect(result.spokenIds).toEqual([]);
    }
    expect(spoken).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("does not auto-announce a Tier 4 observation or its raw fixture", () => {
    ensureCommandCenterInitialized();
    processUntil("DeliveryReceived");
    const delivery = useReasoningStore
      .getState()
      .runtime.reasonings.find((entry) => entry.signal.type === "DeliveryReceived");
    expect(delivery?.priority.finalTier).toBe("Tier4");
    expect(useVoiceStore.getState().announcedEventIds).not.toContain(
      observationId(delivery!.signal.id),
    );
    expect(
      fake.spoken.some((item) => item.text.includes("fixture-delivery-received")),
    ).toBe(false);
    expect(fake.spoken.some((item) => item.text.includes("quantityReceived"))).toBe(
      false,
    );
  });

  it("auto-announces a committed recovery event once from the recovery template", () => {
    ensureCommandCenterInitialized();
    processUntil("DeliveryReceived");
    const last = useVoiceStore.getState().lastAnnouncement;
    expect(last?.kind).toBe("recoveryProven");
    expect(last?.spokenAs).toBe("current");
    expect(last?.text.toLowerCase().includes("recovered")).toBe(true);
    expect(last?.text.includes("Verification succeeded")).toBe(false);
    const recoveryIds = useVoiceStore
      .getState()
      .announcedEventIds.filter((id) => id.startsWith("recovery-"));
    expect(recoveryIds).toHaveLength(1);
    const spokenBefore = fake.spoken.length;
    announceNewlyCommittedEvents(snapshotTimelineEventIds());
    expect(fake.spoken).toHaveLength(spokenBefore);
    expect(
      useVoiceStore.getState().announcedEventIds.filter((id) => id.startsWith("recovery-")),
    ).toEqual(recoveryIds);
  });

  it("auto-announces a newly committed reopen event once", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    const previous = snapshotTimelineEventIds();
    const spokenBefore = fake.spoken.length;
    const snapshot = useProjectStore.getState().snapshot;
    if (!snapshot) throw new Error("snapshot missing");
    const recompute = useRecoveryStore.getState().recompute({
      reasoning: useReasoningStore.getState().runtime,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    expect(recompute.ok).toBe(true);
    const announced = announceNewlyCommittedEvents(previous);
    expect(announced.spokenIds).toHaveLength(1);
    expect(useVoiceStore.getState().lastAnnouncement?.kind).toBe("issueReopened");
    expect(useVoiceStore.getState().lastAnnouncement?.text.toLowerCase()).toContain(
      "reopened",
    );
    expect(fake.spoken).toHaveLength(spokenBefore + 1);
    const ids = [...useVoiceStore.getState().announcedEventIds];
    announceNewlyCommittedEvents(previous);
    expect(useVoiceStore.getState().announcedEventIds).toEqual(ids);
    expect(fake.spoken).toHaveLength(spokenBefore + 1);
  });

  it("does not announce workflow approval, execution, or verification events", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    const spokenAfterObservations = fake.spoken.map((item) => item.text);
    const announcedAfterObservations = [...useVoiceStore.getState().announcedEventIds];
    const decisionId = firstMutatingPendingApprovalId();
    expect(approveDecisionCommitted(decisionId).ok).toBe(true);
    expect(executeDecisionCommitted(decisionId).ok).toBe(true);
    expect(verifyDecisionCommitted(decisionId).ok).toBe(true);
    expect(fake.spoken.map((item) => item.text)).toEqual(spokenAfterObservations);
    expect(useVoiceStore.getState().announcedEventIds).toEqual(
      announcedAfterObservations,
    );
    const context = requireContext();
    const workflow = context.timeline.filter((item) => item.source === "decision");
    expect(workflow.length).toBeGreaterThan(0);
    for (const entry of workflow) {
      expect(useVoiceStore.getState().announcedEventIds).not.toContain(
        entry.timelineEventId,
      );
    }
  });

  it("does not announce recommendation, overlay, score, or AgentResponse text", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    const context = requireContext();
    const asked = askPulseBuildAgent("What is the current Health score?");
    expect(asked.ok).toBe(true);
    const agentTurn = useAgentStore
      .getState()
      .messages.find((message) => message.role === "agent");
    expect(agentTurn && agentTurn.role === "agent" ? agentTurn.response.answerText : "").toBeTruthy();
    const silent = context.timeline.filter(
      (item) =>
        item.label === "Recommendation" ||
        item.source === "overlay" ||
        item.source === "score",
    );
    expect(silent.length).toBeGreaterThan(0);
    for (const entry of silent) {
      expect(useVoiceStore.getState().announcedEventIds).not.toContain(
        entry.timelineEventId,
      );
    }
    for (const utterance of fake.spoken) {
      expect(utterance.text).not.toBe(
        agentTurn && agentTurn.role === "agent" ? agentTurn.response.answerText : "",
      );
      expect(utterance.text.includes("fixture-")).toBe(false);
    }
  });

  it("records an announced event id once and ignores duplicate orchestration reads", () => {
    ensureCommandCenterInitialized();
    const previous = snapshotTimelineEventIds();
    expect(processNextObservationCommitted().ok).toBe(true);
    const first = [...useVoiceStore.getState().announcedEventIds];
    expect(first).toHaveLength(1);
    expect(fake.spoken).toHaveLength(1);
    announceNewlyCommittedEvents(previous);
    announceNewlyCommittedEvents(previous);
    expect(useVoiceStore.getState().announcedEventIds).toEqual(first);
    expect(fake.spoken).toHaveLength(1);
  });

  it("muted and disabled prevent auto-playback and unmuting does not replay missed events", () => {
    ensureCommandCenterInitialized();
    useVoiceStore.getState().setMuted(true);
    expect(processNextObservationCommitted().ok).toBe(true);
    expect(fake.spoken).toHaveLength(0);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    useVoiceStore.getState().setMuted(false);
    expect(fake.spoken).toHaveLength(0);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);

    useVoiceStore.getState().setEnabled(false);
    expect(processNextObservationCommitted().ok).toBe(true);
    expect(fake.spoken).toHaveLength(0);
    useVoiceStore.getState().setEnabled(true);
    expect(fake.spoken).toHaveLength(0);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);

    expect(processNextObservationCommitted().ok).toBe(true);
    expect(fake.spoken).toHaveLength(1);
    expect(useVoiceStore.getState().announcedEventIds).toHaveLength(1);
    const inspection = requireContext().signals.find(
      (item) => item.type === "InspectionMissing",
    );
    expect(useVoiceStore.getState().announcedEventIds).toEqual([
      observationId(inspection!.signalId),
    ]);
  });

  it("replay uses current stale-state evaluation without duplicating ids or advancing time", () => {
    ensureCommandCenterInitialized();
    processUntil("DeliveryReceived");
    const recovered = useVoiceStore.getState().lastAnnouncement;
    expect(recovered?.kind).toBe("recoveryProven");
    expect(recovered?.spokenAs).toBe("current");
    const recoveredIssueId =
      useRecoveryStore.getState().runtime?.history.find((event) => event.type === "Recovered")
        ?.issueId;
    expect(recoveredIssueId).toBeTruthy();
    const announced = [...useVoiceStore.getState().announcedEventIds];
    const clockBefore = requireClockInstant();
    const stepBefore = useSimulatedClockStore.getState().clock?.committedStepCount;
    const snapshot = useProjectStore.getState().snapshot;
    const overlay = useOverlayStore.getState().runtime;
    if (!snapshot || !overlay) throw new Error("runtime missing");
    const idsBeforeReopen = snapshotTimelineEventIds();

    const reopen = useRecoveryStore.getState().recompute({
      reasoning: useReasoningStore.getState().runtime,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    expect(reopen.ok).toBe(true);
    const replayAfterReopen = replayLastEligibleAnnouncement();
    expect(replayAfterReopen.ok).toBe(true);
    expect(useVoiceStore.getState().lastAnnouncement?.timelineEventId).toBe(
      recovered?.timelineEventId,
    );
    expect(useVoiceStore.getState().lastAnnouncement?.spokenAs).toBe("historical");
    expect(useVoiceStore.getState().lastAnnouncement?.text).toBe(
      `Issue ${recoveredIssueId} recovered previously, but the condition is active again.`,
    );
    expect(useVoiceStore.getState().announcedEventIds).toEqual(announced);
    expect(requireClockInstant()).toBe(clockBefore);
    expect(useSimulatedClockStore.getState().clock?.committedStepCount).toBe(stepBefore);

    const announcedReopen = announceNewlyCommittedEvents(idsBeforeReopen);
    expect(announcedReopen.spokenIds).toHaveLength(1);
    expect(useVoiceStore.getState().lastAnnouncement?.kind).toBe("issueReopened");
    expect(useVoiceStore.getState().lastAnnouncement?.spokenAs).toBe("current");
    const reopenAnnouncement = useVoiceStore.getState().lastAnnouncement;
    const reopenIds = [...useVoiceStore.getState().announcedEventIds];

    const recoverAgain = useRecoveryStore.getState().recompute({
      reasoning: useReasoningStore.getState().runtime,
      effective: overlay.effective,
      evaluationSimulatedAt: T_RECOVER_AGAIN,
    });
    expect(recoverAgain.ok).toBe(true);
    const replayAfterRecoverAgain = replayLastEligibleAnnouncement();
    expect(replayAfterRecoverAgain.ok).toBe(true);
    expect(useVoiceStore.getState().lastAnnouncement?.timelineEventId).toBe(
      reopenAnnouncement?.timelineEventId,
    );
    expect(useVoiceStore.getState().lastAnnouncement?.spokenAs).toBe("historical");
    expect(useVoiceStore.getState().lastAnnouncement?.text).toBe(
      `Issue ${recoveredIssueId} reopened previously and has since recovered again.`,
    );
    expect(useVoiceStore.getState().announcedEventIds).toEqual(reopenIds);
    expect(requireClockInstant()).toBe(clockBefore);
  });

  it("Reset cancels speech, clears announcement session, and preserves preferences", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    useVoiceStore.getState().setVolume(0.3);
    useVoiceStore.getState().setSelectedVoiceURI("uri-daniel");
    useVoiceStore.getState().setPreferredVoicePresentation("male");
    useVoiceStore.getState().setAutoAnnounceTier1(false);
    useVoiceStore.getState().setMuted(true);
    const cancelledBefore = fake.cancelledCount();
    resetCommandCenter();
    expect(fake.cancelledCount()).toBe(cancelledBefore + 1);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    expect(useVoiceStore.getState().lastAnnouncement).toBeNull();
    expect(useVoiceStore.getState().speaking).toBe(false);
    expect(useVoiceStore.getState().preferences).toEqual({
      enabled: true,
      muted: true,
      selectedVoiceURI: "uri-daniel",
      preferredVoicePresentation: "male",
      volume: 0.3,
      autoAnnounceTier1: false,
    });
  });

  it("voice playback and replay do not mutate operational runtimes or use network TTS", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    const before = operationalFingerprint();
    replayLastEligibleAnnouncement();
    useVoiceStore.getState().setVolume(0.8);
    announceNewlyCommittedEvents(snapshotTimelineEventIds());
    expect(operationalFingerprint()).toEqual(before);
    expect(fake.spoken.every((item) => item.text.length > 0)).toBe(true);
  });

  it("Phase 4F production sources stay inside the speech-adapter and package boundary", () => {
    const files = [
      "lib/orchestration/voiceAnnouncements.ts",
      "lib/voice/voiceControlPresentation.ts",
      "lib/orchestration/commandCenter.ts",
      "components/chat/AgentChatPanelShell.tsx",
      "store/useVoiceStore.ts",
    ];
    const forbidden = [
      "Date.now(",
      "Math.random(",
      "randomUUID",
      "crypto.randomUUID",
      "setTimeout(",
      "setInterval(",
      "openai",
      "anthropic",
      "supabase",
      "process.env",
      "fetch(",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }

    const uiOrch = [
      "lib/orchestration/voiceAnnouncements.ts",
      "lib/voice/voiceControlPresentation.ts",
      "lib/orchestration/commandCenter.ts",
      "components/chat/AgentChatPanelShell.tsx",
      "store/useVoiceStore.ts",
    ];
    for (const file of uiOrch) {
      const source = readFileSync(file, "utf8");
      for (const token of [
        "window.speechSynthesis",
        "SpeechSynthesisUtterance",
        "SpeechSynthesis",
        "getVoices(",
      ]) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }

    const announcements = readFileSync("lib/orchestration/voiceAnnouncements.ts", "utf8");
    expect(announcements.includes("answerText")).toBe(false);
    expect(announcements.includes("askPulseBuildAgent")).toBe(false);
    expect(announcements.includes("@/lib/agent/explain")).toBe(false);
    expect(announcements.includes("evaluateVoiceEligibility")).toBe(true);
    expect(announcements.includes("prepareReplayAnnouncement")).toBe(true);

    const adapter = readFileSync("lib/voice/speechAdapter.ts", "utf8");
    expect(adapter.includes("SpeechSynthesisUtterance")).toBe(true);
    expect(adapter.includes("getVoices(")).toBe(true);
    expect(adapter.includes("synth.speak")).toBe(true);
    expect(adapter.includes("synth.cancel")).toBe(true);
  });
});
