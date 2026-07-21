export type HealthBand = "green" | "amber" | "red";

export type ScoreBreakdownLine = {
  label: string;
  delta: number;
  sourceEntityIds: string[];
};

/** Deterministic Health result (SoT §10). Explains every contribution. */
export type HealthResult = {
  score: number;
  band: HealthBand;
  explanation: string;
  breakdown: ScoreBreakdownLine[];
};

/** Deterministic Drift bands — PO Decision 2. */
export type DriftLabel = "Normal" | "Warning" | "High Drift" | "Critical Drift";

/** Deterministic Drift result (SoT §10). Explains every contribution. */
export type DriftResult = {
  score: number;
  label: DriftLabel;
  explanation: string;
  breakdown: ScoreBreakdownLine[];
  contributingEntityIds: string[];
};
