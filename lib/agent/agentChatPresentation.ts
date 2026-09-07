/**
 * Phase 4C presentation mapping for stored AgentResponse values.
 *
 * Does not classify questions, call explainers, or read operational stores.
 */

import type {
  AgentEvidenceRef,
  AgentGrounding,
  AgentResponse,
} from "@/domain/agent/types";

export const AGENT_SUGGESTED_QUESTIONS = [
  "What happened?",
  "What is blocking?",
  "What should I do next?",
  "Why is Health red?",
  "Why is Drift high?",
  "What recovered?",
  "What is still unresolved?",
] as const;

export type AgentGroundingStatusCopy = {
  label: "Grounded" | "Unsupported" | "Unavailable";
  detail: string;
};

export function groundingStatusCopy(
  grounding: AgentGrounding,
): AgentGroundingStatusCopy {
  switch (grounding) {
    case "grounded":
      return {
        label: "Grounded",
        detail: "Based on current PulseBuild project facts",
      };
    case "unsupported":
      return {
        label: "Unsupported",
        detail: "Not supported by the current operational context",
      };
    case "unavailable":
      return {
        label: "Unavailable",
        detail: "External language-model explanation is not enabled",
      };
  }
}

export type PresentedAgentResponse = {
  grounding: AgentGrounding;
  groundingLabel: AgentGroundingStatusCopy["label"];
  groundingDetail: string;
  answerText: string;
  unsupportedReason: string | null;
  evidenceRefs: readonly AgentEvidenceRef[];
  generatedAtSimulated: string;
};

/** Display mapping only. Never changes grounding or invents an answer. */
export function presentAgentResponse(response: AgentResponse): PresentedAgentResponse {
  const status = groundingStatusCopy(response.grounding);
  return {
    grounding: response.grounding,
    groundingLabel: status.label,
    groundingDetail: status.detail,
    answerText: response.answerText,
    unsupportedReason: response.unsupportedReason,
    evidenceRefs: response.evidenceRefs,
    generatedAtSimulated: response.generatedAtSimulated,
  };
}

export function evidenceChipLabel(ref: AgentEvidenceRef): string {
  return `${ref.entityType} · ${ref.entityId}`;
}

export function evidenceSignalHref(ref: AgentEvidenceRef): string | null {
  if (ref.entityType !== "signal") return null;
  return `/signals/${ref.entityId}`;
}
