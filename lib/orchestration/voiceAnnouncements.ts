/**
 * Phase 4F synchronized voice announcements.
 *
 * Runs only after committed Command Center workflow actions. Builds a fresh
 * AgentContext, evaluates Phase 4D eligibility, then speaks through the voice
 * store. Does not import Command Center (avoids circular imports) and does not
 * access browser speech APIs.
 */

import type { AgentContext } from "@/domain/agent/types";
import type {
  VoiceAnnouncement,
  VoicePlaybackResult,
  VoicePreferences,
} from "@/domain/voice/types";
import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import {
  evaluateVoiceEligibility,
  prepareReplayAnnouncement,
} from "@/lib/voice/eligibility";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useVoiceStore } from "@/store/useVoiceStore";

export type AnnounceEligibleNewEventsInput = {
  context: AgentContext;
  previousEventIds: readonly string[];
  preferences: VoicePreferences;
  announcedEventIds: readonly string[];
  speak: (announcement: VoiceAnnouncement) => VoicePlaybackResult;
  record: (timelineEventId: string) => void;
};

export function readCurrentAgentContext(): AgentContext | null {
  const overlay = useOverlayStore.getState().runtime;
  const recovery = useRecoveryStore.getState().runtime;
  const clock = useSimulatedClockStore.getState().clock;
  if (!overlay || !recovery || !clock) return null;

  const reasoning = useReasoningStore.getState().runtime;
  const decisions = useDecisionStore.getState().runtime;
  const timeline = joinOperationalTimeline(
    reasoning.timeline,
    decisions.decisions,
    {
      effectHistory: overlay.effectHistory,
      applicationResults: overlay.applicationResults,
      recoveryHistory: recovery.history,
    },
  );

  return buildAgentContext({
    reasoning,
    decisions,
    overlay,
    recovery,
    evaluationSimulatedAt: currentSimulatedAt(clock),
    timeline,
  });
}

export function snapshotTimelineEventIds(): string[] {
  return readCurrentAgentContext()?.timeline.map((item) => item.timelineEventId) ?? [];
}

export function announceEligibleNewEvents(
  input: AnnounceEligibleNewEventsInput,
): { spokenIds: string[] } {
  const previous = new Set(input.previousEventIds);
  const recorded = [...input.announcedEventIds];
  const spokenIds: string[] = [];

  for (const entry of input.context.timeline) {
    if (previous.has(entry.timelineEventId)) continue;
    const eligibility = evaluateVoiceEligibility({
      timelineEntry: entry,
      agentContext: input.context,
      preferences: input.preferences,
      announcedEventIds: recorded,
    });
    if (eligibility.status !== "Eligible") continue;
    const playback = input.speak(eligibility.announcement);
    if (!playback.ok) continue;
    input.record(entry.timelineEventId);
    recorded.push(entry.timelineEventId);
    spokenIds.push(entry.timelineEventId);
  }

  return { spokenIds };
}

export function announceNewlyCommittedEvents(
  previousEventIds: readonly string[],
): { spokenIds: string[] } {
  const context = readCurrentAgentContext();
  if (!context) return { spokenIds: [] };
  const voice = useVoiceStore.getState();
  return announceEligibleNewEvents({
    context,
    previousEventIds,
    preferences: voice.preferences,
    announcedEventIds: voice.announcedEventIds,
    speak: (announcement) => voice.speakAnnouncement(announcement),
    record: (timelineEventId) => voice.recordAnnounced(timelineEventId),
  });
}

export function replayLastEligibleAnnouncement(): VoicePlaybackResult {
  const voice = useVoiceStore.getState();
  const last = voice.lastAnnouncement;
  if (!last) {
    return { ok: false, code: "NO_LAST_ANNOUNCEMENT" };
  }
  const context = readCurrentAgentContext();
  if (!context) {
    return { ok: false, code: "NO_LAST_ANNOUNCEMENT" };
  }
  const entry = context.timeline.find(
    (item) => item.timelineEventId === last.timelineEventId,
  );
  if (!entry) {
    return { ok: false, code: "NO_LAST_ANNOUNCEMENT" };
  }
  const prepared = prepareReplayAnnouncement({
    timelineEntry: entry,
    agentContext: context,
  });
  if (prepared.status !== "Eligible") {
    return { ok: false, code: "NO_LAST_ANNOUNCEMENT" };
  }
  return voice.speakAnnouncement(prepared.announcement);
}
