import type { OrganizationRole } from "@/domain/tenancy/types";

export const PROVISIONING_ROLES = [
  "Owner",
  "ProjectManager",
  "Superintendent",
  "Viewer",
] as const;

export type ProvisioningRole = (typeof PROVISIONING_ROLES)[number];

export type ProvisioningUser = {
  id: string;
  email: string;
};

export type ProvisioningOrganization = {
  id: string;
  name: string;
};

export type ProvisioningMembership = {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
};

export type ProvisioningProject = {
  id: string;
  organizationId: string;
};

export type ProvisioningProjectMembership = {
  id: string;
  userId: string;
  organizationId: string;
  projectId: string;
};

export type ProvisioningAuthSnapshot = {
  accountCount: number;
  sessionCount: number;
};

export type ProvisioningStore = {
  findUserById(userId: string): Promise<ProvisioningUser | null>;
  findUsersByEmail(email: string): Promise<readonly ProvisioningUser[]>;
  findOrganizationById(
    organizationId: string,
  ): Promise<ProvisioningOrganization | null>;
  findOrganizationsByName(
    name: string,
  ): Promise<readonly ProvisioningOrganization[]>;
  findMembership(input: {
    userId: string;
    organizationId: string;
  }): Promise<ProvisioningMembership | null>;
  findProjectById(projectId: string): Promise<ProvisioningProject | null>;
  findProjectMembership(input: {
    userId: string;
    projectId: string;
    organizationId: string;
  }): Promise<ProvisioningProjectMembership | null>;
  readAuthSnapshot(userId: string): Promise<ProvisioningAuthSnapshot>;
  insertOrganization(input: ProvisioningOrganization): Promise<void>;
  insertMembership(input: ProvisioningMembership): Promise<void>;
  insertProjectMembership(input: ProvisioningProjectMembership): Promise<void>;
  transaction<T>(fn: (store: ProvisioningStore) => Promise<T>): Promise<T>;
};

export type OperatorProvisionInput = {
  userId?: string;
  email?: string;
  role: ProvisioningRole;
  organizationId?: string;
  organizationName?: string;
  createOrganization?: boolean;
  projectId?: string;
  apply?: boolean;
  confirmOrganizationId?: string;
};

export type ProvisioningChange =
  | {
      kind: "create_organization";
      organizationId: string;
      name: string;
    }
  | {
      kind: "create_organization_membership";
      membershipId: string;
      userId: string;
      organizationId: string;
      role: ProvisioningRole;
    }
  | {
      kind: "create_project_membership";
      membershipId: string;
      userId: string;
      organizationId: string;
      projectId: string;
    };

export type OperatorProvisionSuccess = {
  status: "ok";
  applied: boolean;
  idempotent: boolean;
  userId: string;
  organizationId: string;
  role: ProvisioningRole;
  changes: readonly ProvisioningChange[];
  notes: readonly string[];
};

export type OperatorProvisionRejection = {
  status: "rejected";
  code: ProvisioningRejectionCode;
  message: string;
};

export type OperatorProvisionResult =
  | OperatorProvisionSuccess
  | OperatorProvisionRejection;

export type ProvisioningRejectionCode =
  | "invalid_input"
  | "user_not_found"
  | "ambiguous_user"
  | "organization_not_found"
  | "ambiguous_organization"
  | "organization_id_conflict"
  | "role_conflict"
  | "project_not_found"
  | "cross_tenant_project"
  | "owner_project_membership_not_used"
  | "apply_not_confirmed"
  | "unique_constraint";
