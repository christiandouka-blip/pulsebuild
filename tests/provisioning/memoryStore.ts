import type { OrganizationRole } from "@/domain/tenancy/types";
import type {
  ProvisioningAuthSnapshot,
  ProvisioningMembership,
  ProvisioningOrganization,
  ProvisioningProject,
  ProvisioningProjectMembership,
  ProvisioningStore,
  ProvisioningUser,
} from "@/lib/provisioning/types";

export class ProvisioningFault extends Error {
  constructor(message = "Provisioning fault") {
    super(message);
    this.name = "ProvisioningFault";
  }
}

type MemoryState = {
  users: ProvisioningUser[];
  organizations: ProvisioningOrganization[];
  memberships: ProvisioningMembership[];
  projects: ProvisioningProject[];
  projectMemberships: ProvisioningProjectMembership[];
  auth: Record<string, ProvisioningAuthSnapshot>;
};

function cloneState(state: MemoryState): MemoryState {
  return structuredClone(state);
}

export class MemoryProvisioningStore implements ProvisioningStore {
  state: MemoryState;
  failOnProjectMembershipInsert = false;

  constructor(state?: Partial<MemoryState>) {
    this.state = {
      users: state?.users ? [...state.users] : [],
      organizations: state?.organizations ? [...state.organizations] : [],
      memberships: state?.memberships ? [...state.memberships] : [],
      projects: state?.projects ? [...state.projects] : [],
      projectMemberships: state?.projectMemberships
        ? [...state.projectMemberships]
        : [],
      auth: state?.auth ? { ...state.auth } : {},
    };
  }

  addUser(user: ProvisioningUser, auth?: ProvisioningAuthSnapshot) {
    this.state.users.push(user);
    this.state.auth[user.id] = auth ?? { accountCount: 1, sessionCount: 1 };
  }

  addOrganization(organization: ProvisioningOrganization) {
    this.state.organizations.push(organization);
  }

  addMembership(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
  ) {
    this.state.memberships.push({
      id: `om_${userId}_${organizationId}`,
      userId,
      organizationId,
      role,
    });
  }

  addProject(project: ProvisioningProject) {
    this.state.projects.push(project);
  }

  async findUserById(userId: string) {
    return this.state.users.find((user) => user.id === userId) ?? null;
  }

  async findUsersByEmail(email: string) {
    const needle = email.trim().toLowerCase();
    return this.state.users.filter(
      (user) => user.email.toLowerCase() === needle,
    );
  }

  async findOrganizationById(organizationId: string) {
    return (
      this.state.organizations.find((item) => item.id === organizationId) ??
      null
    );
  }

  async findOrganizationsByName(name: string) {
    return this.state.organizations.filter((item) => item.name === name);
  }

  async findMembership(input: { userId: string; organizationId: string }) {
    return (
      this.state.memberships.find(
        (item) =>
          item.userId === input.userId &&
          item.organizationId === input.organizationId,
      ) ?? null
    );
  }

  async findProjectById(projectId: string) {
    return this.state.projects.find((item) => item.id === projectId) ?? null;
  }

  async findProjectMembership(input: {
    userId: string;
    projectId: string;
    organizationId: string;
  }) {
    return (
      this.state.projectMemberships.find(
        (item) =>
          item.userId === input.userId &&
          item.projectId === input.projectId &&
          item.organizationId === input.organizationId,
      ) ?? null
    );
  }

  async readAuthSnapshot(userId: string) {
    return this.state.auth[userId] ?? { accountCount: 0, sessionCount: 0 };
  }

  async insertOrganization(input: ProvisioningOrganization) {
    if (this.state.organizations.some((item) => item.id === input.id)) {
      const error = new Error("unique");
      (error as { code?: string }).code = "23505";
      throw error;
    }
    this.state.organizations.push(input);
  }

  async insertMembership(input: ProvisioningMembership) {
    if (
      this.state.memberships.some(
        (item) =>
          item.userId === input.userId &&
          item.organizationId === input.organizationId,
      )
    ) {
      const error = new Error("unique");
      (error as { code?: string }).code = "23505";
      throw error;
    }
    this.state.memberships.push(input);
  }

  async insertProjectMembership(input: ProvisioningProjectMembership) {
    if (this.failOnProjectMembershipInsert) {
      throw new ProvisioningFault();
    }
    if (
      this.state.projectMemberships.some(
        (item) =>
          item.userId === input.userId && item.projectId === input.projectId,
      )
    ) {
      const error = new Error("unique");
      (error as { code?: string }).code = "23505";
      throw error;
    }
    this.state.projectMemberships.push(input);
  }

  async transaction<T>(fn: (store: ProvisioningStore) => Promise<T>): Promise<T> {
    const snapshot = cloneState(this.state);
    try {
      return await fn(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }
}
