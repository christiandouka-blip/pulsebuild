import type { AgentTimelineSource } from "@/domain/agent/types";

/**
 * Phase 4D Voice domain — eligibility and announcement contracts only.
 * No browser speech API, no store, no playback.
 */

export type VoiceAnnouncementKind =
  | "tier1Signal"
  | "recoveryProven"
  | "issueReopened";

export type VoiceSpokenAs = "current" | "historical";

/** User-facing presentation hint only. Browsers do not expose reliable gender. */
export type VoicePreferredPresentation = "any" | "male" | "female";

export type VoicePreferences = {
  enabled: boolean;
  muted: boolean;
  selectedVoiceURI: string | null;
  preferredVoicePresentation: VoicePreferredPresentation;
  volume: number;
  autoAnnounceTier1: boolean;
};

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  enabled: true,
  muted: false,
  selectedVoiceURI: null,
  preferredVoicePresentation: "any",
  volume: 1,
  autoAnnounceTier1: true,
};

/** Conservative grouping hint. Not a guaranteed gender classification. */
export type VoicePresentationHint = "male" | "female" | "unknown";

export type VoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  presentationHint: VoicePresentationHint;
};

export type VoiceSelectionFallback =
  | "selected"
  | "presentation"
  | "default"
  | "first"
  | "unset";

export type VoicePlaybackFailureCode =
  | "UNAVAILABLE"
  | "DISABLED"
  | "MUTED"
  | "NO_LAST_ANNOUNCEMENT"
  | "EMPTY_TEXT";

export type VoicePlaybackResult =
  | {
      ok: true;
      spoken: true;
      voiceURI: string | null;
      fallback: VoiceSelectionFallback;
      announcementId: string;
    }
  | {
      ok: false;
      code: VoicePlaybackFailureCode;
    };

export function isValidVoiceVolume(volume: number): boolean {
  return typeof volume === "number" && Number.isFinite(volume) && volume >= 0 && volume <= 1;
}

export type VoiceSpokenState = {
  announcedEventIds: readonly string[];
};

export type VoiceAnnouncement = {
  id: string;
  timelineEventId: string;
  kind: VoiceAnnouncementKind;
  text: string;
  simulatedAt: string;
  spokenAs: VoiceSpokenAs;
  relatedSignalIds: readonly string[];
  relatedIssueIds: readonly string[];
};

export type VoiceNotEligibleReason =
  | "VoiceDisabled"
  | "VoiceMuted"
  | "AutoAnnounceTier1Disabled"
  | "NotVoiceKind"
  | "NotTier1"
  | "SignalMissing"
  | "IssueMissing"
  | "StaleForAuto";

export type VoiceEligibilityResult =
  | {
      status: "Eligible";
      announcement: VoiceAnnouncement;
    }
  | {
      status: "AlreadyAnnounced";
      timelineEventId: string;
      announcement: null;
    }
  | {
      status: "NotEligible";
      reason: VoiceNotEligibleReason;
      announcement: null;
    };

/** Committed timeline row as consumed by voice policy. */
export type VoiceTimelineEntry = {
  timelineEventId: string;
  source: AgentTimelineSource;
  label: string;
  summary: string;
  simulatedAt: string;
  facts: readonly string[];
};
