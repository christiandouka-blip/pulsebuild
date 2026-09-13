import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import type { VoiceAnnouncement } from "@/domain/voice";
import {
  resetSpeechHost,
  setSpeechHost,
  type SpeechHost,
  type SpeechHostUtterance,
  type SpeechHostVoice,
} from "@/lib/voice/speechAdapter";
import {
  ensureCommandCenterInitialized,
  processNextObservationCommitted,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import { useVoiceStore } from "@/store/useVoiceStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";
import { useAgentStore } from "@/store/useAgentStore";

const SAMPLE: VoiceAnnouncement = {
  id: "announce-tl-obs-signal-1",
  timelineEventId: "tl-obs-signal-1",
  kind: "tier1Signal",
  text: "Tier 1 signal. Inspection Missing on task-pour-level-1-slab.",
  simulatedAt: "2026-03-14T10:30:00.000Z",
  spokenAs: "current",
  relatedSignalIds: ["signal-1"],
  relatedIssueIds: ["issue-1"],
};

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

function createFakeHost(voices: SpeechHostVoice[]) {
  const spoken: SpeechHostUtterance[] = [];
  let cancelled = 0;
  const host: SpeechHost = {
    getVoices: () => voices,
    speak: (utterance) => {
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
  useProjectStore.setState({
    snapshot: null,
    isLoaded: false,
    source: "demo",
    operational: null,
  });
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

describe("useVoiceStore", () => {
  let fake: ReturnType<typeof createFakeHost>;

  beforeEach(() => {
    resetVoiceStore();
    fake = createFakeHost([
      voice({ voiceURI: "uri-samantha", name: "Samantha" }),
      voice({ voiceURI: "uri-daniel", name: "Daniel", default: true }),
    ]);
    setSpeechHost(fake.host);
  });

  afterEach(() => {
    resetSpeechHost();
    resetVoiceStore();
  });

  it("starts from approved defaults", () => {
    resetSpeechHost();
    resetVoiceStore();
    const state = useVoiceStore.getState();
    expect(state.preferences).toEqual(DEFAULT_VOICE_PREFERENCES);
    expect(state.announcedEventIds).toEqual([]);
    expect(state.lastAnnouncement).toBeNull();
    expect(state.voices).toEqual([]);
    expect(state.speechAvailable).toBe(false);
    expect(state.speaking).toBe(false);
  });

  it("applies preference setters deterministically and validates volume", () => {
    const store = useVoiceStore.getState();
    store.setEnabled(false);
    store.setMuted(true);
    store.setSelectedVoiceURI("uri-daniel");
    store.setPreferredVoicePresentation("male");
    store.setAutoAnnounceTier1(false);
    expect(store.setVolume(0)).toBe(true);
    expect(useVoiceStore.getState().preferences).toEqual({
      enabled: false,
      muted: true,
      selectedVoiceURI: "uri-daniel",
      preferredVoicePresentation: "male",
      volume: 0,
      autoAnnounceTier1: false,
    });
    expect(useVoiceStore.getState().setVolume(1)).toBe(true);
    expect(useVoiceStore.getState().preferences.volume).toBe(1);
    expect(useVoiceStore.getState().setVolume(-0.2)).toBe(false);
    expect(useVoiceStore.getState().setVolume(1.4)).toBe(false);
    expect(useVoiceStore.getState().setVolume(Number.NaN)).toBe(false);
    expect(useVoiceStore.getState().preferences.volume).toBe(1);
  });

  it("deduplicates announced event ids", () => {
    useVoiceStore.getState().recordAnnounced("tl-obs-signal-1");
    useVoiceStore.getState().recordAnnounced("tl-obs-signal-1");
    useVoiceStore.getState().recordAnnounced("recovery-1");
    expect(useVoiceStore.getState().announcedEventIds).toEqual([
      "tl-obs-signal-1",
      "recovery-1",
    ]);
  });

  it("sets lastAnnouncement on speak and replays the same id without appending announced ids", () => {
    useVoiceStore.getState().initializeVoices();
    expect(useVoiceStore.getState().speechAvailable).toBe(true);
    expect(useVoiceStore.getState().voices[0]?.voiceURI).toBe("uri-samantha");

    const spoken = structuredClone(SAMPLE);
    const result = useVoiceStore.getState().speakAnnouncement(spoken);
    expect(result.ok).toBe(true);
    expect(useVoiceStore.getState().lastAnnouncement).toEqual(SAMPLE);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    spoken.text = "mutated after speak";
    expect(useVoiceStore.getState().lastAnnouncement?.text).toBe(SAMPLE.text);

    const replay = useVoiceStore.getState().replayLast();
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.announcementId).toBe(SAMPLE.id);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    expect(useVoiceStore.getState().lastAnnouncement?.id).toBe(SAMPLE.id);
    expect(fake.spoken).toHaveLength(2);
  });

  it("handles missing last announcement and muted/disabled/unavailable explicitly", () => {
    expect(useVoiceStore.getState().replayLast()).toEqual({
      ok: false,
      code: "NO_LAST_ANNOUNCEMENT",
    });

    useVoiceStore.getState().setMuted(true);
    expect(useVoiceStore.getState().speakAnnouncement(SAMPLE)).toEqual({
      ok: false,
      code: "MUTED",
    });
    useVoiceStore.getState().setMuted(false);
    useVoiceStore.getState().setEnabled(false);
    expect(useVoiceStore.getState().speakAnnouncement(SAMPLE)).toEqual({
      ok: false,
      code: "DISABLED",
    });
    expect(useVoiceStore.getState().lastAnnouncement).toBeNull();

    useVoiceStore.getState().setEnabled(true);
    setSpeechHost(null);
    expect(useVoiceStore.getState().speakAnnouncement(SAMPLE)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });

  it("clearSession clears ids and last announcement but preserves preferences", () => {
    useVoiceStore.getState().setVolume(0.4);
    useVoiceStore.getState().setSelectedVoiceURI("uri-daniel");
    useVoiceStore.getState().speakAnnouncement(SAMPLE);
    useVoiceStore.getState().recordAnnounced(SAMPLE.timelineEventId);
    expect(useVoiceStore.getState().lastAnnouncement).not.toBeNull();

    useVoiceStore.getState().clearSession();
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    expect(useVoiceStore.getState().lastAnnouncement).toBeNull();
    expect(useVoiceStore.getState().speaking).toBe(false);
    expect(useVoiceStore.getState().preferences.volume).toBe(0.4);
    expect(useVoiceStore.getState().preferences.selectedVoiceURI).toBe("uri-daniel");
  });

  it("Command Center Reset clears voice session, cancels speech, and keeps preferences", () => {
    resetOperationalStores();
    ensureCommandCenterInitialized();
    useVoiceStore.getState().setMuted(true);
    processNextObservationCommitted();
    useVoiceStore.getState().setMuted(false);
    const reasoningBefore = structuredClone(useReasoningStore.getState().runtime);
    const decisionsBefore = structuredClone(useDecisionStore.getState().runtime);
    const overlayBefore = structuredClone(useOverlayStore.getState().runtime);
    const recoveryBefore = structuredClone(useRecoveryStore.getState().runtime);
    const snapshotBefore = JSON.stringify(useProjectStore.getState().snapshot);
    const clockBefore = structuredClone(useSimulatedClockStore.getState().clock);

    useVoiceStore.getState().setVolume(0.25);
    useVoiceStore.getState().setPreferredVoicePresentation("male");
    useVoiceStore.getState().setSelectedVoiceURI("uri-daniel");
    useVoiceStore.getState().setAutoAnnounceTier1(false);
    useVoiceStore.getState().speakAnnouncement(SAMPLE);
    useVoiceStore.getState().recordAnnounced(SAMPLE.timelineEventId);
    useVoiceStore.getState().setMuted(true);
    expect(fake.spoken).toHaveLength(1);
    expect(useSimulatedClockStore.getState().clock).toEqual(clockBefore);
    expect(useReasoningStore.getState().runtime).toEqual(reasoningBefore);

    const cancelledBeforeReset = fake.cancelledCount();
    resetCommandCenter();

    expect(fake.cancelledCount()).toBe(cancelledBeforeReset + 1);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([]);
    expect(useVoiceStore.getState().lastAnnouncement).toBeNull();
    expect(useVoiceStore.getState().speaking).toBe(false);
    expect(useVoiceStore.getState().preferences).toEqual({
      enabled: true,
      muted: true,
      selectedVoiceURI: "uri-daniel",
      preferredVoicePresentation: "male",
      volume: 0.25,
      autoAnnounceTier1: false,
    });
    expect(currentSimulatedAt(useSimulatedClockStore.getState().clock!)).toBe(
      "2026-03-14T10:30:00.000Z",
    );
    expect(JSON.stringify(useProjectStore.getState().snapshot)).toBe(snapshotBefore);
    expect(useReasoningStore.getState().runtime.reasonings).toEqual([]);
    expect(useDecisionStore.getState().runtime.decisions).toEqual([]);
    expect(decisionsBefore.decisions.length).toBeGreaterThan(0);
    expect(overlayBefore).toBeTruthy();
    expect(recoveryBefore).toBeTruthy();
  });

  it("cancel does not clear lastAnnouncement or announced ids", () => {
    useVoiceStore.getState().speakAnnouncement(SAMPLE);
    useVoiceStore.getState().recordAnnounced(SAMPLE.timelineEventId);
    useVoiceStore.getState().cancelSpeech();
    expect(useVoiceStore.getState().lastAnnouncement?.id).toBe(SAMPLE.id);
    expect(useVoiceStore.getState().announcedEventIds).toEqual([SAMPLE.timelineEventId]);
    expect(useVoiceStore.getState().speaking).toBe(false);
    expect(fake.cancelledCount()).toBe(1);
  });

  it("production voice store has no speech API, Agent, operational, or network sources", () => {
    const source = readFileSync("store/useVoiceStore.ts", "utf8");
    for (const token of [
      "Date.now(",
      "Math.random(",
      "randomUUID",
      "crypto.randomUUID",
      "setTimeout(",
      "setInterval(",
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
      "SpeechSynthesis",
      "SpeechSynthesisUtterance",
      "speechSynthesis",
    ]) {
      expect(source.includes(token), `store contains ${token}`).toBe(false);
    }
  });
});
