/**
 * Phase 4F voice presentation copy for Agent Chat controls.
 * Does not access browser speech APIs.
 */

import type {
  VoiceAnnouncement,
  VoiceOption,
  VoicePreferences,
  VoicePreferredPresentation,
} from "@/domain/voice/types";

export const VOICE_PRESENTATION_OPTIONS: readonly {
  value: VoicePreferredPresentation;
  label: string;
}[] = [
  { value: "any", label: "Any" },
  { value: "male", label: "Male-presenting" },
  { value: "female", label: "Female-presenting" },
];

export type VoiceControlView = {
  status: string;
  enabled: boolean;
  muted: boolean;
  selectedVoiceURI: string | null;
  preferredVoicePresentation: VoicePreferredPresentation;
  volumePercent: number;
  voices: readonly VoiceOption[];
  selectedVoiceMissing: boolean;
  speechAvailable: boolean;
  speaking: boolean;
  playbackDisabled: boolean;
  replayDisabled: boolean;
};

export function voiceStatusLabel(input: {
  speechAvailable: boolean;
  speaking: boolean;
  enabled: boolean;
  muted: boolean;
}): string {
  if (!input.speechAvailable) return "Voice unavailable";
  if (input.speaking) return "Speaking";
  if (!input.enabled) return "Voice off";
  if (input.muted) return "Muted";
  return "Voice on";
}

export function formatVoiceOptionLabel(voice: VoiceOption): string {
  const def = voice.default ? " · default" : "";
  return `${voice.name} · ${voice.lang}${def}`;
}

export function volumeToPercent(volume: number): number {
  return Math.round(volume * 100);
}

export function percentToVolume(percent: number): number {
  return percent / 100;
}

export function presentVoiceControls(input: {
  speechAvailable: boolean;
  speaking: boolean;
  voices: readonly VoiceOption[];
  lastAnnouncement: VoiceAnnouncement | null;
  preferences: VoicePreferences;
}): VoiceControlView {
  const selectedVoiceMissing = Boolean(
    input.preferences.selectedVoiceURI &&
      !input.voices.some((voice) => voice.voiceURI === input.preferences.selectedVoiceURI),
  );
  const playbackDisabled = !input.speechAvailable || !input.preferences.enabled;
  return {
    status: voiceStatusLabel({
      speechAvailable: input.speechAvailable,
      speaking: input.speaking,
      enabled: input.preferences.enabled,
      muted: input.preferences.muted,
    }),
    enabled: input.preferences.enabled,
    muted: input.preferences.muted,
    selectedVoiceURI: input.preferences.selectedVoiceURI,
    preferredVoicePresentation: input.preferences.preferredVoicePresentation,
    volumePercent: volumeToPercent(input.preferences.volume),
    voices: input.voices,
    selectedVoiceMissing,
    speechAvailable: input.speechAvailable,
    speaking: input.speaking,
    playbackDisabled,
    replayDisabled:
      playbackDisabled || input.preferences.muted || input.lastAnnouncement === null,
  };
}
