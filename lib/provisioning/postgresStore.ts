import { and, eq, sql } from "drizzle-orm";

import {
  authAccounts,
  authSessions,
  organizationMemberships,
  organizations,
  projectMemberships,
  projects,
  users,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db/client";
import type {
  ProvisioningAuthSnapshot,
  ProvisioningMembership,
  ProvisioningOrganization,
  ProvisioningProjectMembership,
  ProvisioningStore,
  ProvisioningUser,
} from "@/lib/provisioning/types";

type QuerySession = Pick<Database, "select" | "insert">;

function toUser(row: { id: string; email: string }): ProvisioningUser {
  return { id: row.id, email: row.email };
}

export function createPostgresProvisioningStore(
  db: Database,
): ProvisioningStore {
  return createSessionStore(db, db);
}

function createSessionStore(
  db: Database,
  session: QuerySession,
): ProvisioningStore {
  const store: ProvisioningStore = {
    async findUserById(userId) {
      const [row] = await session
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ? toUser(row) : null;
    },

    async findUsersByEmail(email) {
      const rows = await session
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
      return rows.map(toUser);
    },

    async findOrganizationById(organizationId) {
      const [row] = await session
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      return row ?? null;
    },

    async findOrganizationsByName(name) {
      const rows = await session
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.name, name));
      return rows;
    },

    async findMembership(input) {
      const [row] = await session
        .select({
          id: organizationMemberships.id,
          userId: organizationMemberships.userId,
          organizationId: organizationMemberships.organizationId,
          role: organizationMemberships.role,
        })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, input.userId),
            eq(organizationMemberships.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async findProjectById(projectId) {
      const [row] = await session
        .select({
          id: projects.id,
          organizationId: projects.organizationId,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      return row ?? null;
    },

    async findProjectMembership(input) {
      const [row] = await session
        .select({
          id: projectMemberships.id,
          userId: projectMemberships.userId,
          organizationId: projectMemberships.organizationId,
          projectId: projectMemberships.projectId,
        })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.userId, input.userId),
            eq(projectMemberships.projectId, input.projectId),
            eq(projectMemberships.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async readAuthSnapshot(userId) {
      const accounts = await session
        .select({ userId: authAccounts.userId })
        .from(authAccounts)
        .where(eq(authAccounts.userId, userId));
      const sessions = await session
        .select({ userId: authSessions.userId })
        .from(authSessions)
        .where(eq(authSessions.userId, userId));
      const snapshot: ProvisioningAuthSnapshot = {
        accountCount: accounts.length,
        sessionCount: sessions.length,
      };
      return snapshot;
    },

    async insertOrganization(input: ProvisioningOrganization) {
      await session.insert(organizations).values({
        id: input.id,
        name: input.name,
      });
    },

    async insertMembership(input: ProvisioningMembership) {
      await session.insert(organizationMemberships).values({
        id: input.id,
        userId: input.userId,
        organizationId: input.organizationId,
        role: input.role,
      });
    },

    async insertProjectMembership(input: ProvisioningProjectMembership) {
      await session.insert(projectMemberships).values({
        id: input.id,
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
    },

    async transaction(fn) {
      return db.transaction(async (tx) => fn(createSessionStore(db, tx)));
    },
  };

  return store;
}
