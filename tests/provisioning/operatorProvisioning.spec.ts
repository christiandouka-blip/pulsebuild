import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  authorizeOrganizationCapability,
  authorizeProjectAccess,
  publicAuthorizationMessage,
  resolveActiveOrganization,
} from "@/domain/authorization";
import { selectProjectRepository } from "@/lib/repositories/selectProjectRepository";
import { HARBOR_POINT_OPERATIONAL_AT, HARBOR_POINT_ORGANIZATION_ID, HARBOR_POINT_PROJECT_ID } from "@/tests/repositories/recordsFactory";
import { provisionOperator } from "@/lib/provisioning/operatorProvisioning";
import { parseOperatorArgs } from "@/lib/provisioning/parseArgs";
import { MemoryProvisioningStore, ProvisioningFault } from "@/tests/provisioning/memoryStore";
import { makeMembership } from "@/tests/auth/memoryDirectory";

const USER = { id: "user_authjs_1", email: "owner@pulsebuild.test" };
const ORG = "org_pilot";
const PROJECT_A = "proj-a";
const PROJECT_B = "proj-b";

function seedStore() {
  const store = new MemoryProvisioningStore();
  store.addUser(USER);
  store.addUser({ id: "user_pm", email: "pm@pulsebuild.test" });
  store.addUser({ id: "user_dup_a", email: "dup@pulsebuild.test" });
  store.addUser({ id: "user_dup_b", email: "dup@pulsebuild.test" });
  store.addOrganization({ id: ORG, name: "Pilot Org" });
  store.addOrganization({ id: "org_other", name: "Pilot Org" });
  store.addOrganization({ id: "org_b", name: "Org B" });
  store.addProject({ id: PROJECT_A, organizationId: ORG });
  store.addProject({ id: PROJECT_B, organizationId: "org_b" });
  return store;
}

describe("Phase 5H.2 operator argument parsing", () => {
  it("rejects unknown flags and missing role", () => {
    expect(parseOperatorArgs([]).status).toBe("rejected");
    expect(parseOperatorArgs(["--role", "Owner", "--wat"]).status).toBe(
      "rejected",
    );
  });

  it("accepts an Owner bootstrap dry-run command", () => {
    const parsed = parseOperatorArgs([
      "--user-id",
      "<USER_ID>",
      "--role",
      "Owner",
      "--create-organization",
      "--organization-id",
      "<ORG_ID>",
      "--organization-name",
      "<ORG_NAME>",
    ]);
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") {
      expect(parsed.input.apply).toBeFalsy();
      expect(parsed.input.createOrganization).toBe(true);
      expect(parsed.input.role).toBe("Owner");
    }
  });
});

describe("Phase 5H.2 operator provisioning", () => {
  it("leaves an authenticated user without membership unauthorized", async () => {
    const store = seedStore();
    const result = authorizeProjectAccess({
      identity: { userId: USER.id, email: USER.email, displayName: "Owner" },
      userExists: true,
      memberships: [],
      requestedOrganizationId: null,
      project: { id: PROJECT_A, organizationId: ORG },
      hasProjectMembership: false,
      capability: "project:view",
    });
    expect(result.status).toBe("NotOrganizationMember");
    expect(publicAuthorizationMessage(result)).toBe(
      "Organization membership is required.",
    );
    const preview = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
    });
    expect(preview.status).toBe("ok");
    expect(store.state.memberships).toHaveLength(0);
  });

  it("creates an Owner membership when explicitly applied", async () => {
    const store = seedStore();
    const result = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(result).toMatchObject({
      status: "ok",
      applied: true,
      idempotent: false,
      userId: USER.id,
      organizationId: ORG,
      role: "Owner",
    });
    expect(store.state.memberships).toHaveLength(1);
    expect(store.state.memberships[0]?.role).toBe("Owner");

    const authorized = authorizeProjectAccess({
      identity: { userId: USER.id, email: USER.email, displayName: "Owner" },
      userExists: true,
      memberships: [
        makeMembership(USER.id, ORG, "Owner"),
      ],
      requestedOrganizationId: ORG,
      project: { id: PROJECT_A, organizationId: ORG },
      hasProjectMembership: false,
      capability: "project:view",
    });
    expect(authorized.status).toBe("Authorized");
  });

  it("is idempotent and does not duplicate membership", async () => {
    const store = seedStore();
    const input = {
      userId: USER.id,
      role: "Owner" as const,
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    };
    const first = await provisionOperator(store, input);
    const second = await provisionOperator(store, input);
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.idempotent).toBe(true);
      expect(second.changes).toHaveLength(0);
    }
    expect(store.state.memberships).toHaveLength(1);
  });

  it("fails closed for an invalid user", async () => {
    const store = seedStore();
    const result = await provisionOperator(store, {
      userId: "missing",
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(result).toMatchObject({ status: "rejected", code: "user_not_found" });
    expect(store.state.memberships).toHaveLength(0);
  });

  it("fails closed for an invalid organization", async () => {
    const store = seedStore();
    const result = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: "org_missing",
      apply: true,
      confirmOrganizationId: "org_missing",
    });
    expect(result).toMatchObject({
      status: "rejected",
      code: "organization_not_found",
    });
    expect(store.state.memberships).toHaveLength(0);
  });

  it("fails closed when identity resolution is ambiguous", async () => {
    const store = seedStore();
    const byEmail = await provisionOperator(store, {
      email: "dup@pulsebuild.test",
      role: "Owner",
      organizationId: ORG,
    });
    expect(byEmail).toMatchObject({
      status: "rejected",
      code: "ambiguous_user",
    });

    const byName = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationName: "Pilot Org",
    });
    expect(byName).toMatchObject({
      status: "rejected",
      code: "ambiguous_organization",
    });

    const mismatched = await provisionOperator(store, {
      userId: USER.id,
      email: "pm@pulsebuild.test",
      role: "Owner",
      organizationId: ORG,
    });
    expect(mismatched).toMatchObject({
      status: "rejected",
      code: "ambiguous_user",
    });
    expect(store.state.memberships).toHaveLength(0);
  });

  it("rejects cross-tenant project assignment", async () => {
    const store = seedStore();
    const result = await provisionOperator(store, {
      userId: "user_pm",
      role: "ProjectManager",
      organizationId: ORG,
      projectId: PROJECT_B,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(result).toMatchObject({
      status: "rejected",
      code: "cross_tenant_project",
    });
    expect(store.state.memberships).toHaveLength(0);
    expect(store.state.projectMemberships).toHaveLength(0);
  });

  it("requires project membership for non-Owner roles", async () => {
    const store = seedStore();
    const provisioned = await provisionOperator(store, {
      userId: "user_pm",
      role: "ProjectManager",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(provisioned.status).toBe("ok");
    if (provisioned.status === "ok") {
      expect(provisioned.notes.join(" ")).toMatch(/No project membership/);
    }

    const denied = authorizeProjectAccess({
      identity: {
        userId: "user_pm",
        email: "pm@pulsebuild.test",
        displayName: "PM",
      },
      userExists: true,
      memberships: [makeMembership("user_pm", ORG, "ProjectManager")],
      requestedOrganizationId: ORG,
      project: { id: PROJECT_A, organizationId: ORG },
      hasProjectMembership: false,
      capability: "project:view",
    });
    expect(denied.status).toBe("ProjectAccessDenied");

    const assigned = await provisionOperator(store, {
      userId: "user_pm",
      role: "ProjectManager",
      organizationId: ORG,
      projectId: PROJECT_A,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(assigned.status).toBe("ok");
    expect(store.state.projectMemberships).toHaveLength(1);

    const allowed = authorizeProjectAccess({
      identity: {
        userId: "user_pm",
        email: "pm@pulsebuild.test",
        displayName: "PM",
      },
      userExists: true,
      memberships: [makeMembership("user_pm", ORG, "ProjectManager")],
      requestedOrganizationId: ORG,
      project: { id: PROJECT_A, organizationId: ORG },
      hasProjectMembership: true,
      capability: "project:view",
    });
    expect(allowed.status).toBe("Authorized");
  });

  it("keeps Owner organization-wide authorization without project membership", async () => {
    const store = seedStore();
    await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    const create = authorizeOrganizationCapability({
      identity: { userId: USER.id, email: USER.email, displayName: "Owner" },
      userExists: true,
      memberships: [makeMembership(USER.id, ORG, "Owner")],
      requestedOrganizationId: ORG,
      capability: "project:create",
    });
    expect(create.status).toBe("Authorized");
    const view = authorizeProjectAccess({
      identity: { userId: USER.id, email: USER.email, displayName: "Owner" },
      userExists: true,
      memberships: [makeMembership(USER.id, ORG, "Owner")],
      requestedOrganizationId: ORG,
      project: { id: PROJECT_A, organizationId: ORG },
      hasProjectMembership: false,
      capability: "project:manage_members",
    });
    expect(view.status).toBe("Authorized");
  });

  it("does not modify authentication credential counts", async () => {
    const store = seedStore();
    const before = await store.readAuthSnapshot(USER.id);
    await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(await store.readAuthSnapshot(USER.id)).toEqual(before);
  });

  it("never selects Harbor Point when production mode is explicit", async () => {
    const repository = selectProjectRepository({
      PULSEBUILD_RUNTIME_MODE: "production",
      VITEST: "true",
    });
    const loaded = await repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: HARBOR_POINT_ORGANIZATION_ID,
        actorUserId: USER.id,
      },
      projectId: HARBOR_POINT_PROJECT_ID,
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(loaded.status).toBe("DatabaseUnavailable");
  });

  it("lets active organization resolve only a membership the user has", async () => {
    const store = seedStore();
    await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    const memberships = [makeMembership(USER.id, ORG, "Owner")];
    expect(resolveActiveOrganization(memberships, null)).toMatchObject({
      status: "resolved",
      organizationId: ORG,
    });
    expect(resolveActiveOrganization(memberships, "org_b").status).toBe(
      "InvalidActiveOrganization",
    );
  });

  it("rolls back partial authorization state when a later write fails", async () => {
    const store = seedStore();
    store.addProject({ id: "proj_new", organizationId: "org_new" });
    store.failOnProjectMembershipInsert = true;
    await expect(
      provisionOperator(store, {
        userId: "user_pm",
        role: "ProjectManager",
        createOrganization: true,
        organizationId: "org_new",
        organizationName: "New Org",
        projectId: "proj_new",
        apply: true,
        confirmOrganizationId: "org_new",
      }),
    ).rejects.toBeInstanceOf(ProvisioningFault);
    expect(store.state.organizations.some((item) => item.id === "org_new")).toBe(
      false,
    );
    expect(store.state.memberships).toHaveLength(0);
    expect(store.state.projectMemberships).toHaveLength(0);
  });

  it("bootstraps an organization only with explicit create intent", async () => {
    const store = new MemoryProvisioningStore();
    store.addUser(USER);
    const dryRun = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      createOrganization: true,
      organizationId: "org_first",
      organizationName: "First Org",
    });
    expect(dryRun.status).toBe("ok");
    expect(store.state.organizations).toHaveLength(0);

    const unconfirmed = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      createOrganization: true,
      organizationId: "org_first",
      organizationName: "First Org",
      apply: true,
    });
    expect(unconfirmed).toMatchObject({
      status: "rejected",
      code: "apply_not_confirmed",
    });

    const applied = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      createOrganization: true,
      organizationId: "org_first",
      organizationName: "First Org",
      apply: true,
      confirmOrganizationId: "org_first",
    });
    expect(applied.status).toBe("ok");
    expect(store.state.organizations).toHaveLength(1);
    expect(store.state.memberships).toHaveLength(1);
  });

  it("does not treat the first database user as an automatic owner", async () => {
    const store = new MemoryProvisioningStore();
    store.addUser(USER);
    const result = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
    });
    expect(result).toMatchObject({ status: "rejected", code: "invalid_input" });
    expect(store.state.memberships).toHaveLength(0);
  });

  it("refuses to change an existing role", async () => {
    const store = seedStore();
    store.addMembership(USER.id, ORG, "Viewer");
    const result = await provisionOperator(store, {
      userId: USER.id,
      role: "Owner",
      organizationId: ORG,
      apply: true,
      confirmOrganizationId: ORG,
    });
    expect(result).toMatchObject({ status: "rejected", code: "role_conflict" });
    expect(store.state.memberships[0]?.role).toBe("Viewer");
  });

  it("does not expose a public self-elevation HTTP route", () => {
    const page = readFileSync("app/projects/page.tsx", "utf8");
    const signIn = readFileSync("app/sign-in/page.tsx", "utf8");
    const actions = readFileSync("lib/auth/actions.ts", "utf8");
    const cli = readFileSync("scripts/provision-operator.ts", "utf8");
    expect(page.includes("provisionOperator")).toBe(false);
    expect(signIn.includes("provisionOperator")).toBe(false);
    expect(actions.includes("provisionOperator")).toBe(false);
    expect(cli.includes("make me owner")).toBe(false);
    expect(cli.includes("process.env.DATABASE_URL")).toBe(false);
  });
});
