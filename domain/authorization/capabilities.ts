/**
 * Centralized MVP capability names and role matrix.
 *
 * Authorization is evaluated before any Phase 3 FSM command.
 * This module does not import workflow/FSM code.
 */

import type { OrganizationRole } from "@/domain/tenancy/types";

export const CAPABILITIES = [
  "project:view",
  "project:create",
  "project:manage",
  "project:manage_field",
  "observation:submit",
  "observation:process",
  "decision:review",
  "decision:approve",
  "decision:reject",
  "decision:acknowledge",
  "decision:execute",
  "decision:verify",
  "project:manage_members",
  "organization:manage_members",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const OWNER_CAPABILITIES: readonly Capability[] = CAPABILITIES;

const PROJECT_MANAGER_CAPABILITIES: readonly Capability[] = [
  "project:view",
  "project:manage",
  "project:manage_field",
  "observation:submit",
  "observation:process",
  "decision:review",
  "decision:approve",
  "decision:reject",
  "decision:acknowledge",
  "decision:execute",
  "decision:verify",
  "project:manage_members",
];

const SUPERINTENDENT_CAPABILITIES: readonly Capability[] = [
  "project:view",
  "project:manage_field",
  "observation:submit",
  "observation:process",
  "decision:review",
  "decision:approve",
  "decision:reject",
  "decision:acknowledge",
  "decision:execute",
  "decision:verify",
];

const VIEWER_CAPABILITIES: readonly Capability[] = ["project:view"];

const ROLE_CAPABILITIES: Record<OrganizationRole, readonly Capability[]> = {
  Owner: OWNER_CAPABILITIES,
  ProjectManager: PROJECT_MANAGER_CAPABILITIES,
  Superintendent: SUPERINTENDENT_CAPABILITIES,
  Viewer: VIEWER_CAPABILITIES,
};

export function capabilitiesForRole(role: OrganizationRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}

export function roleHasCapability(
  role: OrganizationRole,
  capability: Capability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
