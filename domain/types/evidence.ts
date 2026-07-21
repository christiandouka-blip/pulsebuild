import type { EvidenceId } from "@/domain/types/identifiers";

export type EvidenceSourceType = "seed" | "simulation" | "user" | "system";

export type EvidenceItem = {
  id: EvidenceId;
  evidenceType: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  relatedEntityType: string;
  relatedEntityId: string;
  observedValue: string;
  timestamp: string;
  confidence?: number;
};
