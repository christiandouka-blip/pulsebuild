import { createHash } from "node:crypto";

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makeImportJobId(input: {
  organizationId: string;
  actorUserId: string;
  filename: string;
  createdAt: string;
  bytes: Uint8Array;
}): string {
  return `imp_${sha256Hex(
    `${input.organizationId}|${input.actorUserId}|${input.filename}|${input.createdAt}|${sha256Hex(input.bytes)}`,
  ).slice(0, 32)}`;
}

export function makeProjectId(importJobId: string): string {
  return `proj_${sha256Hex(importJobId).slice(0, 28)}`;
}

export function makeEntityId(
  projectId: string,
  kind: string,
  externalId: string,
): string {
  return `${kind}_${sha256Hex(`${projectId}|${kind}|${externalId.trim()}`).slice(0, 24)}`;
}
