/**
 * Minimal staging diagnostics. Only allowlisted fields are written.
 * Never pass secrets, URLs with credentials, tokens, cookies, or emails.
 */

export const PILOT_LOG_AREAS = ["auth", "database", "import", "operations"] as const;

export type PilotLogArea = (typeof PILOT_LOG_AREAS)[number];

export type PilotLogEvent = {
  area: PilotLogArea;
  outcome: string;
  status?: string;
};

const ALLOWED_AREAS = new Set<string>(PILOT_LOG_AREAS);

const SECRET_PATTERN =
  /(DATABASE_URL|AUTH_SECRET|AUTH_MICROSOFT_ENTRA_ID_SECRET|password|passwd|token|cookie|authorization|bearer|client_secret)/i;
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s]+/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function containsUnsafeDiagnostic(value: string): boolean {
  return (
    SECRET_PATTERN.test(value) ||
    URL_PATTERN.test(value) ||
    EMAIL_PATTERN.test(value)
  );
}

function isPlainEventRecord(event: unknown): event is Record<string, unknown> {
  return (
    typeof event === "object" &&
    event !== null &&
    !Array.isArray(event) &&
    !(event instanceof Error)
  );
}

export function serializePilotLog(event: unknown): string | null {
  if (!isPlainEventRecord(event)) {
    return null;
  }

  const area = event.area;
  const outcome = event.outcome;
  const status = event.status;
  if (typeof area !== "string" || typeof outcome !== "string") {
    return null;
  }
  if (!ALLOWED_AREAS.has(area)) {
    return null;
  }
  if (status !== undefined && typeof status !== "string") {
    return null;
  }
  if (containsUnsafeDiagnostic(area) || containsUnsafeDiagnostic(outcome)) {
    return null;
  }
  if (status && containsUnsafeDiagnostic(status)) {
    return null;
  }

  const payload: Record<string, string> = {
    source: "pulsebuild",
    area,
    outcome,
  };
  if (status) {
    payload.status = status;
  }
  return JSON.stringify(payload);
}

export function logPilotEvent(event: PilotLogEvent): void {
  const line = serializePilotLog(event);
  if (!line) {
    return;
  }
  console.info(line);
}
