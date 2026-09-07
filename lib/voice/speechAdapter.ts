/**
 * Browser speech adapter — the only production module that may access
 * browser speech APIs. Tests inject a SpeechHost; Node/SSR returns unavailable.
 */

import type {
  VoiceAnnouncement,
  VoiceOption,
  VoicePlaybackResult,
  VoicePreferences,
  VoicePresentationHint,
  VoiceSelectionFallback,
} from "@/domain/voice/types";
import { isValidVoiceVolume } from "@/domain/voice/types";

export type SpeechHostVoice = {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
};

export type SpeechHostUtterance = {
  text: string;
  volume: number;
  voiceURI: string | null;
};

export type SpeechHost = {
  getVoices: () => readonly SpeechHostVoice[];
  speak: (utterance: SpeechHostUtterance) => void;
  cancel: () => void;
};

const FEMALE_HINTS = [
  "female",
  "woman",
  "samantha",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "zira",
  "hazel",
  "susan",
  "kathy",
  "vicki",
  "allison",
  "ava",
] as const;

const MALE_HINTS = [
  "male",
  "man",
  "daniel",
  "david",
  "fred",
  "ralph",
  "bruce",
  "alex",
  "gordon",
  "rishi",
  "oliver",
  "tom",
] as const;

let hostOverride: SpeechHost | null | undefined;

export function setSpeechHost(host: SpeechHost | null): void {
  hostOverride = host;
}

export function resetSpeechHost(): void {
  hostOverride = undefined;
}

export function isSpeechAvailable(): boolean {
  return resolveHost() !== null;
}

export function listVoices(): VoiceOption[] {
  const host = resolveHost();
  if (!host) return [];
  return host.getVoices().map(toVoiceOption);
}

export function speakAnnouncement(
  announcement: VoiceAnnouncement,
  preferences: VoicePreferences,
): VoicePlaybackResult {
  if (!preferences.enabled) {
    return { ok: false, code: "DISABLED" };
  }
  if (preferences.muted) {
    return { ok: false, code: "MUTED" };
  }
  const text = announcement.text.trim();
  if (text.length === 0) {
    return { ok: false, code: "EMPTY_TEXT" };
  }
  const host = resolveHost();
  if (!host) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const voices = listVoices();
  const selected = selectVoice(voices, preferences);
  host.speak({
    text,
    volume: clampVolume(preferences.volume),
    voiceURI: selected.voice?.voiceURI ?? null,
  });
  return {
    ok: true,
    spoken: true,
    voiceURI: selected.voice?.voiceURI ?? null,
    fallback: selected.fallback,
    announcementId: announcement.id,
  };
}

export function cancelSpeech(): void {
  resolveHost()?.cancel();
}

export function presentationHintForVoiceName(name: string): VoicePresentationHint {
  const female = FEMALE_HINTS.some((token) => nameMatchesHint(name, token));
  const male = MALE_HINTS.some((token) => nameMatchesHint(name, token));
  if (female && !male) return "female";
  if (male && !female) return "male";
  return "unknown";
}

export function selectVoice(
  voices: readonly VoiceOption[],
  preferences: VoicePreferences,
): { voice: VoiceOption | null; fallback: VoiceSelectionFallback } {
  if (preferences.selectedVoiceURI) {
    const exact = voices.find((item) => item.voiceURI === preferences.selectedVoiceURI);
    if (exact) return { voice: exact, fallback: "selected" };
  }
  if (preferences.preferredVoicePresentation !== "any") {
    const hinted = voices.find(
      (item) => item.presentationHint === preferences.preferredVoicePresentation,
    );
    if (hinted) return { voice: hinted, fallback: "presentation" };
  }
  const browserDefault = voices.find((item) => item.default);
  if (browserDefault) return { voice: browserDefault, fallback: "default" };
  if (voices[0]) return { voice: voices[0], fallback: "first" };
  return { voice: null, fallback: "unset" };
}

function toVoiceOption(voice: SpeechHostVoice): VoiceOption {
  return {
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default,
    presentationHint: presentationHintForVoiceName(voice.name),
  };
}

function nameMatchesHint(name: string, token: string): boolean {
  const lower = name.toLowerCase();
  if (token === "male") return /\bmale\b/.test(lower) && !/\bfemale\b/.test(lower);
  if (token === "female") return /\bfemale\b/.test(lower);
  if (token === "man") return /\bman\b/.test(lower) && !/\bwoman\b/.test(lower);
  return lower.includes(token);
}

function clampVolume(volume: number): number {
  if (!isValidVoiceVolume(volume)) {
    if (typeof volume !== "number" || !Number.isFinite(volume)) return 1;
    if (volume < 0) return 0;
    return 1;
  }
  return volume;
}

function resolveHost(): SpeechHost | null {
  if (hostOverride !== undefined) return hostOverride;
  return createBrowserSpeechHost();
}

function createBrowserSpeechHost(): SpeechHost | null {
  const synth = getBrowserSynthesis();
  if (!synth) return null;
  return {
    getVoices: () =>
      synth.getVoices().map((voice) => ({
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        localService: voice.localService,
        default: voice.default,
      })),
    speak: (utterance) => {
      const spoken = new SpeechSynthesisUtterance(utterance.text);
      spoken.volume = utterance.volume;
      if (utterance.voiceURI) {
        const match = synth.getVoices().find((voice) => voice.voiceURI === utterance.voiceURI);
        if (match) spoken.voice = match;
      }
      synth.speak(spoken);
    },
    cancel: () => {
      synth.cancel();
    },
  };
}

function getBrowserSynthesis(): SpeechSynthesis | null {
  const globalObject = globalThis as {
    window?: { speechSynthesis?: SpeechSynthesis };
    speechSynthesis?: SpeechSynthesis;
  };
  const synth = globalObject.window?.speechSynthesis ?? globalObject.speechSynthesis;
  if (
    !synth ||
    typeof synth.getVoices !== "function" ||
    typeof synth.speak !== "function" ||
    typeof synth.cancel !== "function"
  ) {
    return null;
  }
  return synth;
}
