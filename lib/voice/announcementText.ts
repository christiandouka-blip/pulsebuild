/**
 * Deterministic Voice announcement templates.
 *
 * Facts come from AgentContext. Does not call the chat explainer or invent
 * recommendations. Historical vs current wording is supplied by eligibility.
 */

import type { VoiceSpokenAs } from "@/domain/voice/types";

export type Tier1TextFacts = {
  kind: "tier1Signal";
  spokenAs: VoiceSpokenAs;
  signalType: string;
  relatedTaskId: string | null;
  issueKind: string | null;
};

export type RecoveryTextFacts = {
  kind: "recoveryProven";
  spokenAs: VoiceSpokenAs;
  issueId: string;
  issueKind: string | null;
  otherActiveRisksRemain: boolean;
};

export type ReopenTextFacts = {
  kind: "issueReopened";
  spokenAs: VoiceSpokenAs;
  issueId: string;
  issueKind: string | null;
};

export type VoiceTextFacts = Tier1TextFacts | RecoveryTextFacts | ReopenTextFacts;

export function voiceAnnouncementText(facts: VoiceTextFacts): string {
  switch (facts.kind) {
    case "tier1Signal":
      return tier1AnnouncementText(facts);
    case "recoveryProven":
      return recoveryAnnouncementText(facts);
    case "issueReopened":
      return reopenAnnouncementText(facts);
  }
}

export function voiceAnnouncementId(timelineEventId: string): string {
  return `announce-${timelineEventId}`;
}

export function readableOperationalName(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function tier1AnnouncementText(facts: Tier1TextFacts): string {
  if (facts.spokenAs === "historical") {
    const type = readableOperationalName(facts.signalType);
    return `This was a Tier 1 ${type} blocker and has since recovered.`;
  }
  const type = readableOperationalName(facts.signalType);
  const task = facts.relatedTaskId ? ` on ${facts.relatedTaskId}` : "";
  const issue =
    facts.issueKind && facts.issueKind !== facts.signalType
      ? ` ${readableOperationalName(facts.issueKind)} is active.`
      : "";
  return `Tier 1 signal. ${type}${task}.${issue}`.trim();
}

function recoveryAnnouncementText(facts: RecoveryTextFacts): string {
  if (facts.spokenAs === "historical") {
    return `Issue ${facts.issueId} recovered previously, but the condition is active again.`;
  }
  const blocker = facts.issueKind
    ? `${readableOperationalName(facts.issueKind)} blocker recovered.`
    : `Issue ${facts.issueId} recovered.`;
  const remainder = facts.otherActiveRisksRemain
    ? " Other active project risks remain."
    : " No other currently active blockers remain.";
  return `${blocker}${remainder}`;
}

function reopenAnnouncementText(facts: ReopenTextFacts): string {
  if (facts.spokenAs === "historical") {
    return `Issue ${facts.issueId} reopened previously and has since recovered again.`;
  }
  const blocker = facts.issueKind
    ? `${readableOperationalName(facts.issueKind)} blocker reopened.`
    : `Issue ${facts.issueId} reopened.`;
  return `${blocker} The previously recovered blocker requires attention again.`;
}
