import { cookies } from "next/headers";

import type { Capability } from "@/domain/authorization/capabilities";
import type { AuthorizationResult } from "@/domain/authorization/types";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import {
  authorizeOrganizationContext,
  authorizeProjectCreateRequest,
  authorizeProjectRequest,
} from "@/lib/auth/authorize";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/cookies";
import { auth } from "@/lib/auth/nextAuth";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { createDrizzleIdentityDirectory } from "@/lib/db/identityDirectory";

export async function readRequestedOrganizationId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

/**
 * Production server entry for future Route Handlers and Server Actions.
 * Re-checks membership in the database. Proxy/middleware is not sufficient.
 */
export async function authorizeCurrentUserForProject(input: {
  projectId: string;
  capability: Capability;
  organizationId?: string | null;
}): Promise<AuthorizationResult> {
  if (!isProductionRuntime()) {
    throw new Error(
      "Production authorization is unavailable in demo mode. Harbor Point does not use this path.",
    );
  }

  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const organizationId =
    input.organizationId ?? (await readRequestedOrganizationId());

  return authorizeProjectRequest({
    identity,
    organizationId,
    projectId: input.projectId,
    capability: input.capability,
    directory: createDrizzleIdentityDirectory(getDb()),
  });
}

export async function authorizeCurrentUserOrganization(
  organizationId?: string | null,
): Promise<AuthorizationResult> {
  if (!isProductionRuntime()) {
    throw new Error(
      "Production authorization is unavailable in demo mode. Harbor Point does not use this path.",
    );
  }

  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const requested =
    organizationId ?? (await readRequestedOrganizationId());

  return authorizeOrganizationContext({
    identity,
    organizationId: requested,
    directory: createDrizzleIdentityDirectory(getDb()),
  });
}

export async function authorizeCurrentUserToCreateProject(
  organizationId?: string | null,
): Promise<AuthorizationResult> {
  if (!isProductionRuntime()) {
    throw new Error(
      "Production authorization is unavailable in demo mode. Harbor Point does not use this path.",
    );
  }

  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const requested =
    organizationId ?? (await readRequestedOrganizationId());

  return authorizeProjectCreateRequest({
    identity,
    organizationId: requested,
    directory: createDrizzleIdentityDirectory(getDb()),
  });
}
