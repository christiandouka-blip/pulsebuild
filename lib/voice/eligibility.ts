/**
 * Pure Voice eligibility and replay preparation.
 *
 * Consumes committed AgentContext timeline rows only. Does not read stores,
 * browser speech APIs, Agent Chat history, or chat explainer output.
 */

import type {
  AgentContext,
  AgentOpenIssueView,
  AgentRecoveryHistoryView,
  AgentSignalView,
  AgentTimelineView,
} from "@/domain/agent/types";
import type {
  VoiceAnnouncement,
  VoiceEligibilityResult,
  VoiceNotEligibleReason,
  VoicePreferences,
  VoiceSpokenAs,
  VoiceTimelineEntry,
} from "@/domain/voice/types";
import {
  voiceAnnouncementId,
  voiceAnnouncementText,
  type VoiceTextFacts,
} from "@/lib/voice/announcementText";

export type EvaluateVoiceEligibilityInput = {
  timelineEntry: VoiceTimelineEntry | AgentTimelineView;
  agentContext: AgentContext;
  preferences: VoicePreferences;
  announcedEventIds: readonly string[];
};

export type PrepareReplayAnnouncementInput = {
  timelineEntry: VoiceTimelineEntry | AgentTimelineView;
  agentContext: AgentContext;
};

type ClassifiedVoiceEvent =
  | {
      status: "ok";
      kind: "tier1Signal";
      stale: boolean;
      entry: VoiceTimelineEntry;
      context: AgentContext;
      signal: AgentSignalView;
      issue: AgentOpenIssueView | null;
      recovery: null;
    }
  | {
      status: "ok";
      kind: "recoveryProven" | "issueReopened";
      stale: boolean;
      entry: VoiceTimelineEntry;
      context: AgentContext;
      signal: AgentSignalView | null;
      issue: AgentOpenIssueView | null;
      recovery: AgentRecoveryHistoryView;
    }
  | { status: "reject"; reason: VoiceNotEligibleReason };

export function evaluateVoiceEligibility(
  input: EvaluateVoiceEligibilityInput,
): VoiceEligibilityResult {
  const entry = normalizeEntry(input.timelineEntry);
  if (input.announcedEventIds.includes(entry.timelineEventId)) {
    return {
      status: "AlreadyAnnounced",
      timelineEventId: entry.timelineEventId,
      announcement: null,
    };
  }
  if (!input.preferences.enabled) {
    return { status: "NotEligible", reason: "VoiceDisabled", announcement: null };
  }
  if (input.preferences.muted) {
    return { status: "NotEligible", reason: "VoiceMuted", announcement: null };
  }

  const classified = classifyVoiceEvent(entry, input.agentContext);
  if (classified.status !== "ok") {
    return { status: "NotEligible", reason: classified.reason, announcement: null };
  }
  if (classified.kind === "tier1Signal" && !input.preferences.autoAnnounceTier1) {
    return {
      status: "NotEligible",
      reason: "AutoAnnounceTier1Disabled",
      announcement: null,
    };
  }
  if (classified.stale) {
    return { status: "NotEligible", reason: "StaleForAuto", announcement: null };
  }

  return {
    status: "Eligible",
    announcement: buildAnnouncement(classified, "current"),
  };
}

export function prepareReplayAnnouncement(
  input: PrepareReplayAnnouncementInput,
): VoiceEligibilityResult {
  const entry = normalizeEntry(input.timelineEntry);
  const classified = classifyVoiceEvent(entry, input.agentContext);
  if (classified.status !== "ok") {
    return { status: "NotEligible", reason: classified.reason, announcement: null };
  }
  const spokenAs: VoiceSpokenAs = classified.stale ? "historical" : "current";
  return {
    status: "Eligible",
    announcement: buildAnnouncement(classified, spokenAs),
  };
}

function classifyVoiceEvent(
  entry: VoiceTimelineEntry,
  context: AgentContext,
): ClassifiedVoiceEvent {
  if (entry.source === "reasoning" && entry.label === "Observation") {
    const signal = context.signals.find(
      (item) => entry.timelineEventId === `tl-obs-${item.signalId}`,
    );
    if (!signal) {
      return { status: "reject", reason: "SignalMissing" };
    }
    if (signal.finalTier !== "Tier1") {
      return { status: "reject", reason: "NotTier1" };
    }
    const issue =
      context.openIssues.find((item) => item.signalId === signal.signalId) ?? null;
    return {
      status: "ok",
      kind: "tier1Signal",
      stale: issue?.currentlyRecovered === true,
      entry,
      context,
      signal,
      issue,
      recovery: null,
    };
  }

  if (entry.source === "recovery") {
    const recovery = context.recoveryHistory.find(
      (item) => item.eventId === entry.timelineEventId,
    );
    if (!recovery) {
      return { status: "reject", reason: "IssueMissing" };
    }
    const issue =
      context.openIssues.find((item) => item.issueId === recovery.issueId) ?? null;
    const currentlyRecovered = context.currentlyRecoveredIssues.some(
      (item) => item.issueId === recovery.issueId,
    );
    if (recovery.type === "Recovered") {
      return {
        status: "ok",
        kind: "recoveryProven",
        stale: !currentlyRecovered,
        entry,
        context,
        signal: signalForIssue(context, recovery.issueId),
        issue,
        recovery,
      };
    }
    return {
      status: "ok",
      kind: "issueReopened",
      stale: currentlyRecovered,
      entry,
      context,
      signal: signalForIssue(context, recovery.issueId),
      issue,
      recovery,
    };
  }

  return { status: "reject", reason: "NotVoiceKind" };
}

function buildAnnouncement(
  classified: Extract<ClassifiedVoiceEvent, { status: "ok" }>,
  spokenAs: VoiceSpokenAs,
): VoiceAnnouncement {
  const known = knownIds(classified);
  const relatedSignalIds = unique(
    [classified.signal?.signalId, classified.issue?.signalId].filter(
      (id): id is string => typeof id === "string" && known.has(id),
    ),
  );
  const relatedIssueIds = unique(
    [classified.issue?.issueId, classified.recovery?.issueId].filter(
      (id): id is string => typeof id === "string" && known.has(id),
    ),
  );

  return {
    id: voiceAnnouncementId(classified.entry.timelineEventId),
    timelineEventId: classified.entry.timelineEventId,
    kind: classified.kind,
    text: voiceAnnouncementText(textFacts(classified, spokenAs)),
    simulatedAt: classified.entry.simulatedAt,
    spokenAs,
    relatedSignalIds,
    relatedIssueIds,
  };
}

function textFacts(
  classified: Extract<ClassifiedVoiceEvent, { status: "ok" }>,
  spokenAs: VoiceSpokenAs,
): VoiceTextFacts {
  if (classified.kind === "tier1Signal") {
    return {
      kind: "tier1Signal",
      spokenAs,
      signalType: classified.signal.type,
      relatedTaskId: classified.signal.relatedTaskId,
      issueKind: classified.issue?.kind ?? null,
    };
  }
  if (classified.kind === "recoveryProven") {
    return {
      kind: "recoveryProven",
      spokenAs,
      issueId: classified.recovery.issueId,
      issueKind: classified.issue?.kind ?? null,
      otherActiveRisksRemain: classified.context.recoverySummary.currentlyOpenCount > 0,
    };
  }
  return {
    kind: "issueReopened",
    spokenAs,
    issueId: classified.recovery.issueId,
    issueKind: classified.issue?.kind ?? null,
  };
}

function signalForIssue(
  context: AgentContext,
  issueId: string,
): AgentSignalView | null {
  const issue = context.openIssues.find((item) => item.issueId === issueId);
  const recovered = context.currentlyRecoveredIssues.find(
    (item) => item.issueId === issueId,
  );
  const signalId = issue?.signalId ?? recovered?.signalId;
  if (!signalId) return null;
  return context.signals.find((item) => item.signalId === signalId) ?? null;
}

function knownIds(
  classified: Extract<ClassifiedVoiceEvent, { status: "ok" }>,
): Set<string> {
  const ids = new Set<string>([classified.entry.timelineEventId]);
  for (const item of classified.context.signals) ids.add(item.signalId);
  for (const item of classified.context.openIssues) {
    ids.add(item.issueId);
    ids.add(item.signalId);
  }
  for (const item of classified.context.currentlyRecoveredIssues) {
    ids.add(item.issueId);
    ids.add(item.signalId);
  }
  for (const item of classified.context.recoveryHistory) ids.add(item.issueId);
  return ids;
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function normalizeEntry(
  entry: VoiceTimelineEntry | AgentTimelineView,
): VoiceTimelineEntry {
  return {
    timelineEventId: entry.timelineEventId,
    source: entry.source,
    label: entry.label,
    summary: entry.summary,
    simulatedAt: entry.simulatedAt,
    facts: entry.facts,
  };
}
