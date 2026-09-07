/**
 * Phase 4E Voice store — preferences, session announcement state, and playback.
 *
 * Consumes VoiceAnnouncement only. Does not import Agent or operational stores.
 * Browser speech APIs are reached only through the speech adapter.
 */

import { create } from "zustand";

import type {
  VoiceAnnouncement,
  VoiceOption,
  VoicePlaybackResult,
  VoicePreferences,
  VoicePreferredPresentation,
} from "@/domain/voice/types";
import {
  DEFAULT_VOICE_PREFERENCES,
  isValidVoiceVolume,
} from "@/domain/voice/types";
import {
  cancelSpeech as adapterCancel,
  isSpeechAvailable,
  listVoices,
  speakAnnouncement as adapterSpeak,
} from "@/lib/voice/speechAdapter";

type VoiceStoreState = {
  preferences: VoicePreferences;
  announcedEventIds: string[];
  lastAnnouncement: VoiceAnnouncement | null;
  voices: VoiceOption[];
  speechAvailable: boolean;
  speaking: boolean;
  initializeVoices: () => void;
  refreshVoices: () => void;
  setEnabled: (enabled: boolean) => void;
  setMuted: (muted: boolean) => void;
  setSelectedVoiceURI: (voiceURI: string | null) => void;
  setPreferredVoicePresentation: (presentation: VoicePreferredPresentation) => void;
  setVolume: (volume: number) => boolean;
  setAutoAnnounceTier1: (autoAnnounceTier1: boolean) => void;
  recordAnnounced: (timelineEventId: string) => void;
  speakAnnouncement: (announcement: VoiceAnnouncement) => VoicePlaybackResult;
  replayLast: () => VoicePlaybackResult;
  cancelSpeech: () => void;
  clearSession: () => void;
};

function copyAnnouncement(announcement: VoiceAnnouncement): VoiceAnnouncement {
  return {
    ...announcement,
    relatedSignalIds: [...announcement.relatedSignalIds],
    relatedIssueIds: [...announcement.relatedIssueIds],
  };
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  preferences: { ...DEFAULT_VOICE_PREFERENCES },
  announcedEventIds: [],
  lastAnnouncement: null,
  voices: [],
  speechAvailable: false,
  speaking: false,

  initializeVoices: () => {
    get().refreshVoices();
  },

  refreshVoices: () => {
    set({
      speechAvailable: isSpeechAvailable(),
      voices: listVoices(),
    });
  },

  setEnabled: (enabled) => {
    set({
      preferences: { ...get().preferences, enabled },
    });
  },

  setMuted: (muted) => {
    set({
      preferences: { ...get().preferences, muted },
    });
  },

  setSelectedVoiceURI: (voiceURI) => {
    set({
      preferences: { ...get().preferences, selectedVoiceURI: voiceURI },
    });
  },

  setPreferredVoicePresentation: (presentation) => {
    set({
      preferences: { ...get().preferences, preferredVoicePresentation: presentation },
    });
  },

  setVolume: (volume) => {
    if (!isValidVoiceVolume(volume)) return false;
    set({
      preferences: { ...get().preferences, volume },
    });
    return true;
  },

  setAutoAnnounceTier1: (autoAnnounceTier1) => {
    set({
      preferences: { ...get().preferences, autoAnnounceTier1 },
    });
  },

  recordAnnounced: (timelineEventId) => {
    const current = get().announcedEventIds;
    if (current.includes(timelineEventId)) return;
    set({ announcedEventIds: [...current, timelineEventId] });
  },

  speakAnnouncement: (announcement) => {
    const result = adapterSpeak(announcement, get().preferences);
    if (!result.ok) {
      set({ speaking: false });
      return result;
    }
    set({
      lastAnnouncement: copyAnnouncement(announcement),
      speaking: true,
    });
    return result;
  },

  replayLast: () => {
    const last = get().lastAnnouncement;
    if (!last) {
      return { ok: false, code: "NO_LAST_ANNOUNCEMENT" };
    }
    return get().speakAnnouncement(last);
  },

  cancelSpeech: () => {
    adapterCancel();
    set({ speaking: false });
  },

  clearSession: () => {
    set({
      announcedEventIds: [],
      lastAnnouncement: null,
      speaking: false,
    });
  },
}));
