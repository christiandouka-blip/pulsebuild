import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_VOICE_PREFERENCES } from "@/domain/voice";
import type { VoiceOption } from "@/domain/voice";
import {
  formatVoiceOptionLabel,
  percentToVolume,
  presentVoiceControls,
  VOICE_PRESENTATION_OPTIONS,
  voiceStatusLabel,
  volumeToPercent,
} from "@/lib/voice/voiceControlPresentation";
import {
  resetSpeechHost,
  setSpeechHost,
  type SpeechHost,
  type SpeechHostUtterance,
  type SpeechHostVoice,
} from "@/lib/voice/speechAdapter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import {
  ensureCommandCenterInitialized,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import { useVoiceStore } from "@/store/useVoiceStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";
import { useAgentStore } from "@/store/useAgentStore";

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

function requireClockInstant(): string {
  const clock = useSimulatedClockStore.getState().clock;
  if (!clock) throw new Error("clock missing");
  return currentSimulatedAt(clock);
}

function sampleVoices(): VoiceOption[] {
  return [
    {
      voiceURI: "uri-samantha",
      name: "Samantha",
      lang: "en-US",
      localService: true,
      default: false,
      presentationHint: "female",
    },
    {
      voiceURI: "uri-daniel",
      name: "Daniel",
      lang: "en-GB",
      localService: true,
      default: true,
      presentationHint: "male",
    },
    {
      voiceURI: "uri-unknown",
      name: "Voice 1",
      lang: "en-US",
      localService: true,
      default: false,
      presentationHint: "unknown",
    },
  ];
}

describe("Phase 4F voice controls", () => {
  let fake: ReturnType<typeof createFakeHost>;

  beforeEach(() => {
    resetOperationalStores();
    resetVoiceStore();
    fake = createFakeHost([
      voice({ voiceURI: "uri-samantha", name: "Samantha" }),
      voice({ voiceURI: "uri-daniel", name: "Daniel", default: true }),
      voice({ voiceURI: "uri-unknown", name: "Voice 1" }),
    ]);
    setSpeechHost(fake.host);
  });

  afterEach(() => {
    resetSpeechHost();
    resetVoiceStore();
    resetOperationalStores();
  });

  it("reads current preferences into the control view", () => {
    useVoiceStore.getState().setEnabled(true);
    useVoiceStore.getState().setMuted(false);
    useVoiceStore.getState().setSelectedVoiceURI("uri-daniel");
    useVoiceStore.getState().setPreferredVoicePresentation("male");
    expect(useVoiceStore.getState().setVolume(0.4)).toBe(true);
    useVoiceStore.getState().initializeVoices();

    const state = useVoiceStore.getState();
    const view = presentVoiceControls({
      speechAvailable: state.speechAvailable,
      speaking: state.speaking,
      voices: state.voices,
      lastAnnouncement: state.lastAnnouncement,
      preferences: state.preferences,
    });

    expect(view.enabled).toBe(true);
    expect(view.muted).toBe(false);
    expect(view.selectedVoiceURI).toBe("uri-daniel");
    expect(view.preferredVoicePresentation).toBe("male");
    expect(view.volumePercent).toBe(40);
    expect(view.status).toBe("Voice on");
    expect(view.voices.map((item) => item.voiceURI)).toEqual([
      "uri-samantha",
      "uri-daniel",
      "uri-unknown",
    ]);
    expect(view.voices.some((item) => item.presentationHint === "unknown")).toBe(true);
    expect(formatVoiceOptionLabel(view.voices[1]!)).toContain("Daniel");
    expect(formatVoiceOptionLabel(view.voices[1]!)).toContain("default");
  });

  it("enabled toggle updates the store without advancing the clock", () => {
    ensureCommandCenterInitialized();
    const before = requireClockInstant();
    useVoiceStore.getState().setEnabled(false);
    expect(useVoiceStore.getState().preferences.enabled).toBe(false);
    useVoiceStore.getState().setEnabled(true);
    expect(useVoiceStore.getState().preferences.enabled).toBe(true);
    expect(requireClockInstant()).toBe(before);
  });

  it("muted toggle updates the store without advancing the clock", () => {
    ensureCommandCenterInitialized();
    const before = requireClockInstant();
    useVoiceStore.getState().setMuted(true);
    expect(useVoiceStore.getState().preferences.muted).toBe(true);
    useVoiceStore.getState().setMuted(false);
    expect(useVoiceStore.getState().preferences.muted).toBe(false);
    expect(requireClockInstant()).toBe(before);
  });

  it("voice selection updates selectedVoiceURI and keeps a missing saved voice", () => {
    useVoiceStore.getState().initializeVoices();
    useVoiceStore.getState().setSelectedVoiceURI("uri-samantha");
    expect(useVoiceStore.getState().preferences.selectedVoiceURI).toBe("uri-samantha");
    useVoiceStore.getState().setSelectedVoiceURI("saved-missing-uri");
    expect(useVoiceStore.getState().preferences.selectedVoiceURI).toBe("saved-missing-uri");
    const view = presentVoiceControls({
      speechAvailable: true,
      speaking: false,
      voices: sampleVoices(),
      lastAnnouncement: null,
      preferences: useVoiceStore.getState().preferences,
    });
    expect(view.selectedVoiceMissing).toBe(true);
    expect(view.selectedVoiceURI).toBe("saved-missing-uri");
  });

  it("presentation preference updates using Male-presenting / Female-presenting labels", () => {
    expect(VOICE_PRESENTATION_OPTIONS).toEqual([
      { value: "any", label: "Any" },
      { value: "male", label: "Male-presenting" },
      { value: "female", label: "Female-presenting" },
    ]);
    useVoiceStore.getState().setPreferredVoicePresentation("female");
    expect(useVoiceStore.getState().preferences.preferredVoicePresentation).toBe("female");
    useVoiceStore.getState().setPreferredVoicePresentation("any");
    expect(useVoiceStore.getState().preferences.preferredVoicePresentation).toBe("any");
  });

  it("converts a valid percentage volume into the store contract", () => {
    expect(percentToVolume(0)).toBe(0);
    expect(percentToVolume(100)).toBe(1);
    expect(volumeToPercent(0.25)).toBe(25);
    expect(useVoiceStore.getState().setVolume(percentToVolume(55))).toBe(true);
    expect(useVoiceStore.getState().preferences.volume).toBe(0.55);
    expect(useVoiceStore.getState().setVolume(1.2)).toBe(false);
    expect(useVoiceStore.getState().preferences.volume).toBe(0.55);
  });

  it("represents an unavailable browser speech state in the control view", () => {
    resetSpeechHost();
    resetVoiceStore();
    useVoiceStore.getState().initializeVoices();
    expect(useVoiceStore.getState().speechAvailable).toBe(false);
    expect(useVoiceStore.getState().voices).toEqual([]);
    expect(
      voiceStatusLabel({
        speechAvailable: false,
        speaking: false,
        enabled: true,
        muted: false,
      }),
    ).toBe("Voice unavailable");
    const view = presentVoiceControls({
      speechAvailable: false,
      speaking: false,
      voices: [],
      lastAnnouncement: null,
      preferences: DEFAULT_VOICE_PREFERENCES,
    });
    expect(view.status).toBe("Voice unavailable");
    expect(view.playbackDisabled).toBe(true);
    expect(view.replayDisabled).toBe(true);
  });

  it("shows muted, speaking, and off status without implying operational state", () => {
    expect(
      voiceStatusLabel({
        speechAvailable: true,
        speaking: true,
        enabled: true,
        muted: true,
      }),
    ).toBe("Speaking");
    expect(
      voiceStatusLabel({
        speechAvailable: true,
        speaking: false,
        enabled: true,
        muted: true,
      }),
    ).toBe("Muted");
    expect(
      voiceStatusLabel({
        speechAvailable: true,
        speaking: false,
        enabled: false,
        muted: false,
      }),
    ).toBe("Voice off");
  });

  it("preference changes and voice initialization do not mutate operational runtimes", () => {
    ensureCommandCenterInitialized();
    const before = {
      reasoning: structuredClone(useReasoningStore.getState().runtime),
      decisions: structuredClone(useDecisionStore.getState().runtime),
      overlay: structuredClone(useOverlayStore.getState().runtime),
      recovery: structuredClone(useRecoveryStore.getState().runtime),
      snapshot: JSON.stringify(useProjectStore.getState().snapshot),
      clock: structuredClone(useSimulatedClockStore.getState().clock),
    };
    useVoiceStore.getState().initializeVoices();
    useVoiceStore.getState().setEnabled(false);
    useVoiceStore.getState().setMuted(true);
    useVoiceStore.getState().setSelectedVoiceURI("uri-daniel");
    useVoiceStore.getState().setPreferredVoicePresentation("female");
    useVoiceStore.getState().setVolume(0.2);
    expect(useReasoningStore.getState().runtime).toEqual(before.reasoning);
    expect(useDecisionStore.getState().runtime).toEqual(before.decisions);
    expect(useOverlayStore.getState().runtime).toEqual(before.overlay);
    expect(useRecoveryStore.getState().runtime).toEqual(before.recovery);
    expect(JSON.stringify(useProjectStore.getState().snapshot)).toBe(before.snapshot);
    expect(useSimulatedClockStore.getState().clock).toEqual(before.clock);
    resetCommandCenter();
    expect(useVoiceStore.getState().preferences.enabled).toBe(false);
    expect(useVoiceStore.getState().preferences.muted).toBe(true);
    expect(useVoiceStore.getState().preferences.selectedVoiceURI).toBe("uri-daniel");
    expect(useVoiceStore.getState().preferences.preferredVoicePresentation).toBe("female");
    expect(useVoiceStore.getState().preferences.volume).toBe(0.2);
  });

  it("Agent Chat voice UI is labeled, keyboard-focusable, and never calls SpeechSynthesis", () => {
    const source = readFileSync("components/chat/AgentChatPanelShell.tsx", "utf8");
    for (const token of [
      'id="voice-enabled"',
      "Voice enabled",
      'id="voice-mute-auto"',
      "Mute auto-announcements",
      'id="voice-selector"',
      'id="voice-presentation"',
      "VOICE_PRESENTATION_OPTIONS",
      'id="voice-volume"',
      'type="range"',
      'id="voice-replay"',
      "Replay last announcement",
      "focus-visible:ring-2",
      "initializeVoices",
    ]) {
      expect(source.includes(token), `missing ${token}`).toBe(true);
    }
    expect(source.includes('type="button"')).toBe(true);
    expect(source.includes("VOICE_PRESENTATION_OPTIONS")).toBe(true);
    const presentation = readFileSync("lib/voice/voiceControlPresentation.ts", "utf8");
    expect(presentation.includes("Male-presenting")).toBe(true);
    expect(presentation.includes("Female-presenting")).toBe(true);
    for (const token of [
      "window.speechSynthesis",
      "SpeechSynthesisUtterance",
      "getVoices(",
      "speechSynthesis",
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
    ]) {
      expect(source.includes(token), `UI contains ${token}`).toBe(false);
    }
  });
});
