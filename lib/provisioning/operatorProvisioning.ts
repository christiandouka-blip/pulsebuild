import { roleRequiresProjectAssignment } from "@/domain/authorization/policy";

import type {
  OperatorProvisionInput,
  OperatorProvisionResult,
  ProvisioningChange,
  ProvisioningStore,
  ProvisioningUser,
} from "@/lib/provisioning/types";

const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

export function organizationMembershipId(
  userId: string,
  organizationId: string,
): string {
  return `om_${userId}_${organizationId}`;
}

export function projectMembershipId(userId: string, projectId: string): string {
  return `pmem_${userId}_${projectId}`;
}

function rejected(
  code: Extract<OperatorProvisionResult, { status: "rejected" }>["code"],
  message: string,
): OperatorProvisionResult {
  return { status: "rejected", code, message };
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function isProvisioningFault(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: string }).name === "ProvisioningFault",
  );
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "23505",
  );
}

async function resolveUser(
  store: ProvisioningStore,
  input: OperatorProvisionInput,
): Promise<ProvisioningUser | OperatorProvisionResult> {
  const userId = trimmed(input.userId);
  const email = trimmed(input.email);
  if (!userId && !email) {
    return rejected(
      "invalid_input",
      "Identify the user with --user-id and/or --email.",
    );
  }

  let byId: ProvisioningUser | null = null;
  if (userId) {
    byId = await store.findUserById(userId);
    if (!byId) {
      return rejected("user_not_found", "User was not found.");
    }
  }

  let byEmail: ProvisioningUser | null = null;
  if (email) {
    const matches = await store.findUsersByEmail(email);
    if (matches.length === 0) {
      return rejected("user_not_found", "User was not found.");
    }
    if (matches.length > 1) {
      return rejected(
        "ambiguous_user",
        "Email matches more than one user. Use --user-id.",
      );
    }
    byEmail = matches[0] ?? null;
  }

  if (byId && byEmail && byId.id !== byEmail.id) {
    return rejected(
      "ambiguous_user",
      "--user-id and --email refer to different users.",
    );
  }

  return byId ?? byEmail!;
}

async function resolveOrganization(
  store: ProvisioningStore,
  input: OperatorProvisionInput,
): Promise<
  | { organizationId: string; name: string; create: boolean }
  | OperatorProvisionResult
> {
  const organizationId = trimmed(input.organizationId);
  const organizationName = trimmed(input.organizationName);
  const create = Boolean(input.createOrganization);

  if (create) {
    if (!organizationId || !organizationName) {
      return rejected(
        "invalid_input",
        "--create-organization requires --organization-id and --organization-name.",
      );
    }
    if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
      return rejected(
        "invalid_input",
        "Organization id must be 2-64 letters, numbers, underscores, or hyphens.",
      );
    }
    const existing = await store.findOrganizationById(organizationId);
    if (!existing) {
      return { organizationId, name: organizationName, create: true };
    }
    if (existing.name !== organizationName) {
      return rejected(
        "organization_id_conflict",
        "Organization id already exists with a different name.",
      );
    }
    return {
      organizationId: existing.id,
      name: existing.name,
      create: false,
    };
  }

  if (organizationId) {
    const existing = await store.findOrganizationById(organizationId);
    if (!existing) {
      return rejected("organization_not_found", "Organization was not found.");
    }
    if (organizationName && existing.name !== organizationName) {
      return rejected(
        "organization_id_conflict",
        "Organization id and name do not match.",
      );
    }
    return {
      organizationId: existing.id,
      name: existing.name,
      create: false,
    };
  }

  if (!organizationName) {
    return rejected(
      "invalid_input",
      "Provide --organization-id, or a unique --organization-name.",
    );
  }

  const matches = await store.findOrganizationsByName(organizationName);
  if (matches.length === 0) {
    return rejected("organization_not_found", "Organization was not found.");
  }
  if (matches.length > 1) {
    return rejected(
      "ambiguous_organization",
      "Organization name is ambiguous. Use --organization-id.",
    );
  }
  const organization = matches[0]!;
  return {
    organizationId: organization.id,
    name: organization.name,
    create: false,
  };
}

export async function provisionOperator(
  store: ProvisioningStore,
  input: OperatorProvisionInput,
): Promise<OperatorProvisionResult> {
  const user = await resolveUser(store, input);
  if ("status" in user) {
    return user;
  }

  const organization = await resolveOrganization(store, input);
  if ("status" in organization) {
    return organization;
  }

  const projectId = trimmed(input.projectId);
  if (input.role === "Owner" && projectId) {
    return rejected(
      "owner_project_membership_not_used",
      "Owner access is organization-wide. Omit --project-id.",
    );
  }

  if (projectId) {
    const project = await store.findProjectById(projectId);
    if (!project) {
      return rejected("project_not_found", "Project was not found.");
    }
    if (project.organizationId !== organization.organizationId) {
      return rejected(
        "cross_tenant_project",
        "Project does not belong to the target organization.",
      );
    }
  }

  const existingMembership = await store.findMembership({
    userId: user.id,
    organizationId: organization.organizationId,
  });
  if (existingMembership && existingMembership.role !== input.role) {
    return rejected(
      "role_conflict",
      "A different organization role already exists for this user.",
    );
  }

  const existingAssignment = projectId
    ? await store.findProjectMembership({
        userId: user.id,
        projectId,
        organizationId: organization.organizationId,
      })
    : null;

  const authBefore = await store.readAuthSnapshot(user.id);
  const changes: ProvisioningChange[] = [];
  const notes: string[] = [];

  if (organization.create) {
    changes.push({
      kind: "create_organization",
      organizationId: organization.organizationId,
      name: organization.name,
    });
  }

  if (!existingMembership) {
    changes.push({
      kind: "create_organization_membership",
      membershipId: organizationMembershipId(
        user.id,
        organization.organizationId,
      ),
      userId: user.id,
      organizationId: organization.organizationId,
      role: input.role,
    });
  } else {
    notes.push("Organization membership already exists.");
  }

  if (projectId) {
    if (existingAssignment) {
      notes.push("Project membership already exists.");
    } else {
      changes.push({
        kind: "create_project_membership",
        membershipId: projectMembershipId(user.id, projectId),
        userId: user.id,
        organizationId: organization.organizationId,
        projectId,
      });
    }
  } else if (roleRequiresProjectAssignment(input.role)) {
    notes.push(
      "No project membership assigned. This role cannot open a project until one is provisioned.",
    );
  }

  if (input.apply && trimmed(input.confirmOrganizationId) !== organization.organizationId) {
    return rejected(
      "apply_not_confirmed",
      "Pass --apply --confirm <organization-id> to mutate.",
    );
  }

  const authUnchanged = async (): Promise<boolean> => {
    const authAfter = await store.readAuthSnapshot(user.id);
    return (
      authAfter.accountCount === authBefore.accountCount &&
      authAfter.sessionCount === authBefore.sessionCount
    );
  };

  if (!input.apply) {
    if (!(await authUnchanged())) {
      return rejected(
        "invalid_input",
        "Provisioning must not modify authentication credentials.",
      );
    }
    return {
      status: "ok",
      applied: false,
      idempotent: changes.length === 0,
      userId: user.id,
      organizationId: organization.organizationId,
      role: input.role,
      changes,
      notes,
    };
  }

  if (changes.length > 0) {
    try {
      await store.transaction(async (session) => {
        for (const change of changes) {
          if (change.kind === "create_organization") {
            await session.insertOrganization({
              id: change.organizationId,
              name: change.name,
            });
          }
          if (change.kind === "create_organization_membership") {
            await session.insertMembership({
              id: change.membershipId,
              userId: change.userId,
              organizationId: change.organizationId,
              role: change.role,
            });
          }
          if (change.kind === "create_project_membership") {
            await session.insertProjectMembership({
              id: change.membershipId,
              userId: change.userId,
              organizationId: change.organizationId,
              projectId: change.projectId,
            });
          }
        }
      });
    } catch (error) {
      if (isProvisioningFault(error)) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        return rejected(
          "unique_constraint",
          "A conflicting membership record already exists.",
        );
      }
      throw error;
    }
  }

  if (!(await authUnchanged())) {
    return rejected(
      "invalid_input",
      "Provisioning must not modify authentication credentials.",
    );
  }

  return {
    status: "ok",
    applied: true,
    idempotent: changes.length === 0,
    userId: user.id,
    organizationId: organization.organizationId,
    role: input.role,
    changes,
    notes,
  };
}
