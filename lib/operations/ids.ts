import { createHash } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function makeObservationId(input: {
  organizationId: string;
  projectId: string;
  idempotencyKey: string;
}): string {
  return `obs_${sha256Hex(
    `${input.organizationId}|${input.projectId}|${input.idempotencyKey}`,
  ).slice(0, 32)}`;
}

export function makeCommandId(input: {
  organizationId: string;
  projectId: string;
  idempotencyKey: string;
}): string {
  return `ocmd_${sha256Hex(
    `${input.organizationId}|${input.projectId}|${input.idempotencyKey}`,
  ).slice(0, 32)}`;
}

export function makeObservationIdempotencyKey(input: {
  organizationId: string;
  projectId: string;
  signalType: string;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: string;
  payload: Record<string, unknown>;
}): string {
  return sha256Hex(
    [
      input.organizationId,
      input.projectId,
      input.signalType,
      input.relatedEntityType,
      input.relatedEntityId,
      input.relatedTaskId,
      canonicalJson(input.payload),
    ].join("|"),
  );
}

export function makeDecisionIdempotencyKey(input: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  decisionId: string;
  commands: unknown;
}): string {
  return sha256Hex(
    [
      input.organizationId,
      input.projectId,
      input.actorUserId,
      input.decisionId,
      canonicalJson(input.commands),
    ].join("|"),
  );
}

export function makeTransitionId(input: {
  commandId: string;
  commandType: string;
  index: number;
}): string {
  return `odt_${sha256Hex(
    `${input.commandId}|${input.commandType}|${input.index}`,
  ).slice(0, 32)}`;
}

export function makeScoreSnapshotId(commandId: string): string {
  return `oscore_${sha256Hex(commandId).slice(0, 28)}`;
}

export function makeApplicationId(input: {
  commandId: string;
  effectId: string;
}): string {
  return `oapp_${sha256Hex(`${input.commandId}|${input.effectId}`).slice(0, 32)}`;
}
