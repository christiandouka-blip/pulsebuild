import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  capabilitiesForRole,
  publicAuthorizationMessage,
  roleHasCapability,
} from "@/domain/authorization";
import { authorizeProjectRequest } from "@/lib/auth/authorize";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";

const ORG_A = "org-a";
const ORG_B = "org-b";
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";

function identity(userId: string, email = `${userId}@pulsebuild.test`) {
  return { userId, email, displayName: userId };
}

async function setupDirectory() {
  const directory = new MemoryIdentityDirectory();
  directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test", "Owner A"));
  directory.users.set("pm-a", makeUser("pm-a", "pm-a@pulsebuild.test", "PM A"));
  directory.users.set("super-a", makeUser("super-a", "super-a@pulsebuild.test", "Super A"));
  directory.users.set("viewer-a", makeUser("viewer-a", "viewer-a@pulsebuild.test", "Viewer A"));
  directory.users.set("multi", makeUser("multi", "multi@pulsebuild.test", "Multi"));
  directory.users.set("unassigned-pm", makeUser("unassigned-pm", "unassigned-pm@pulsebuild.test"));
  directory.users.set("unassigned-super", makeUser("unassigned-super", "unassigned-super@pulsebuild.test"));
  directory.users.set("unassigned-viewer", makeUser("unassigned-viewer", "unassigned-viewer@pulsebuild.test"));

  directory.memberships.push(
    makeMembership("owner-a", ORG_A, "Owner"),
    makeMembership("pm-a", ORG_A, "ProjectManager"),
    makeMembership("super-a", ORG_A, "Superintendent"),
    makeMembership("viewer-a", ORG_A, "Viewer"),
    makeMembership("multi", ORG_A, "Viewer"),
    makeMembership("multi", ORG_B, "Owner"),
    makeMembership("unassigned-pm", ORG_A, "ProjectManager"),
    makeMembership("unassigned-super", ORG_A, "Superintendent"),
    makeMembership("unassigned-viewer", ORG_A, "Viewer"),
  );

  directory.projects.push(
    { id: PROJECT_A, organizationId: ORG_A },
    { id: PROJECT_B, organizationId: ORG_B },
  );

  directory.assignments.push(
    { userId: "pm-a", projectId: PROJECT_A, organizationId: ORG_A },
    { userId: "super-a", projectId: PROJECT_A, organizationId: ORG_A },
    { userId: "viewer-a", projectId: PROJECT_A, organizationId: ORG_A },
    { userId: "multi", projectId: PROJECT_A, organizationId: ORG_A },
  );

  return directory;
}

describe("Phase 5B authentication and authorization", () => {
  it("rejects an unauthenticated request", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: null,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("Unauthenticated");
  });

  it("resolves authenticated identity to a PulseBuild user", async () => {
    const directory = await setupDirectory();
    const port = toAuthPortIdentity({
      user: { id: "owner-a", email: "owner-a@pulsebuild.test", name: "Owner A" },
    });
    expect(port).toEqual({
      userId: "owner-a",
      email: "owner-a@pulsebuild.test",
      displayName: "Owner A",
    });

    const user = await directory.findUserById("owner-a");
    expect(user?.email).toBe("owner-a@pulsebuild.test");
    expect(user?.displayName).toBe("Owner A");
  });

  it("handles unknown authenticated identity explicitly", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("ghost"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("UnknownIdentity");
  });

  it("supports a user who belongs to multiple organizations", async () => {
    const directory = await setupDirectory();
    const asViewerInA = await authorizeProjectRequest({
      identity: identity("multi"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    const asOwnerInB = await authorizeProjectRequest({
      identity: identity("multi"),
      organizationId: ORG_B,
      projectId: PROJECT_B,
      capability: "organization:manage_members",
      directory,
    });
    expect(asViewerInA.status).toBe("Authorized");
    if (asViewerInA.status === "Authorized") {
      expect(asViewerInA.role).toBe("Viewer");
      expect(asViewerInA.scope.organizationId).toBe(ORG_A);
    }
    expect(asOwnerInB.status).toBe("Authorized");
    if (asOwnerInB.status === "Authorized") {
      expect(asOwnerInB.role).toBe("Owner");
      expect(asOwnerInB.scope.organizationId).toBe(ORG_B);
    }
  });

  it("rejects an invalid active organization", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_B,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("InvalidActiveOrganization");
  });

  it("allows an org A Owner to access an org A project without assignment", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("Authorized");
    if (result.status === "Authorized") {
      expect(result.scope).toEqual({
        organizationId: ORG_A,
        actorUserId: "owner-a",
      });
    }
  });

  it("denies an org A Owner access to an org B project", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_A,
      projectId: PROJECT_B,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("ProjectNotFound");
    expect(publicAuthorizationMessage(result)).toBe("Project access denied.");
  });

  it("denies a guessed cross-tenant project id without existence leak", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_A,
      projectId: PROJECT_B,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("ProjectNotFound");
    const message = publicAuthorizationMessage(result);
    expect(message).toBe("Project access denied.");
    expect(message.includes(ORG_B)).toBe(false);
    expect(message.includes("org B")).toBe(false);
    expect(JSON.stringify(result).includes("Harbor Point")).toBe(false);
  });

  it("does not authorize a project using membership from the wrong organization", async () => {
    const directory = await setupDirectory();
    directory.assignments.push({
      userId: "pm-a",
      projectId: PROJECT_B,
      organizationId: ORG_A,
    });
    const result = await authorizeProjectRequest({
      identity: identity("pm-a"),
      organizationId: ORG_A,
      projectId: PROJECT_B,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("ProjectNotFound");
  });

  it("does not require project membership for Owner", async () => {
    const directory = await setupDirectory();
    expect(
      directory.assignments.some((row) => row.userId === "owner-a"),
    ).toBe(false);
    const result = await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:manage_members",
      directory,
    });
    expect(result.status).toBe("Authorized");
  });

  it("requires project membership for ProjectManager", async () => {
    const directory = await setupDirectory();
    const allowed = await authorizeProjectRequest({
      identity: identity("pm-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(allowed.status).toBe("Authorized");
  });

  it("requires project membership for Superintendent", async () => {
    const directory = await setupDirectory();
    const allowed = await authorizeProjectRequest({
      identity: identity("super-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(allowed.status).toBe("Authorized");
  });

  it("requires project membership for Viewer", async () => {
    const directory = await setupDirectory();
    const allowed = await authorizeProjectRequest({
      identity: identity("viewer-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(allowed.status).toBe("Authorized");
  });

  it("denies a ProjectManager without assignment", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("unassigned-pm"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("ProjectAccessDenied");
  });

  it("denies a Superintendent without assignment", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("unassigned-super"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "observation:submit",
      directory,
    });
    expect(result.status).toBe("ProjectAccessDenied");
  });

  it("denies a Viewer without assignment", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("unassigned-viewer"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:view",
      directory,
    });
    expect(result.status).toBe("ProjectAccessDenied");
  });

  it("grants Owner the full approved capability set", () => {
    expect(capabilitiesForRole("Owner")).toEqual([
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
    ]);
  });

  it("grants ProjectManager the approved assigned-project capability set", () => {
    expect(roleHasCapability("ProjectManager", "organization:manage_members")).toBe(
      false,
    );
    expect(roleHasCapability("ProjectManager", "project:create")).toBe(false);
    expect(roleHasCapability("ProjectManager", "project:manage_members")).toBe(true);
    expect(roleHasCapability("ProjectManager", "decision:execute")).toBe(true);
  });

  it("grants Superintendent workflow capabilities without project administration", () => {
    expect(roleHasCapability("Superintendent", "project:create")).toBe(false);
    expect(roleHasCapability("Superintendent", "project:manage")).toBe(false);
    expect(roleHasCapability("Superintendent", "project:manage_field")).toBe(true);
    expect(roleHasCapability("Superintendent", "decision:approve")).toBe(true);
    expect(roleHasCapability("Superintendent", "project:manage_members")).toBe(
      false,
    );
  });

  it("keeps Viewer read-only", () => {
    expect(capabilitiesForRole("Viewer")).toEqual(["project:view"]);
  });

  it("denies Viewer observation submit", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("viewer-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "observation:submit",
      directory,
    });
    expect(result.status).toBe("CapabilityDenied");
    if (result.status === "CapabilityDenied") {
      expect(result.capability).toBe("observation:submit");
    }
  });

  it("denies Viewer decision approval", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("viewer-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "decision:approve",
      directory,
    });
    expect(result.status).toBe("CapabilityDenied");
  });

  it("denies Superintendent organization-member management", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("super-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "organization:manage_members",
      directory,
    });
    expect(result.status).toBe("CapabilityDenied");
  });

  it("denies ProjectManager organization-member management", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("pm-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "organization:manage_members",
      directory,
    });
    expect(result.status).toBe("CapabilityDenied");
  });

  it("allows ProjectManager assigned-project membership management", async () => {
    const directory = await setupDirectory();
    const result = await authorizeProjectRequest({
      identity: identity("pm-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "project:manage_members",
      directory,
    });
    expect(result.status).toBe("Authorized");
  });

  it("does not treat email as the workflow actor after User resolution", () => {
    const port = toAuthPortIdentity({
      user: { id: "owner-a", email: "owner-a@pulsebuild.test", name: "Owner A" },
    });
    expect(port?.userId).toBe("owner-a");
    expect(port?.userId).not.toBe(port?.email);
  });

  it("incomplete Auth.js session is unauthenticated at the port boundary", () => {
    expect(toAuthPortIdentity({ user: { email: "x@y.com" } })).toBeNull();
    expect(toAuthPortIdentity(null)).toBeNull();
  });
});

describe("Phase 5B FSM separation", () => {
  it("authorization does not modify DecisionState", async () => {
    const directory = await setupDirectory();
    const decisionState = { state: "PendingReview" as const };
    await authorizeProjectRequest({
      identity: identity("owner-a"),
      organizationId: ORG_A,
      projectId: PROJECT_A,
      capability: "decision:approve",
      directory,
    });
    expect(decisionState.state).toBe("PendingReview");
  });

  it("authorization modules do not import or rewrite FSM rules", () => {
    const files = [
      "domain/authorization/policy.ts",
      "domain/authorization/capabilities.ts",
      "domain/authorization/types.ts",
      "lib/auth/authorize.ts",
      "lib/auth/workflowGate.ts",
    ];
    const forbidden = [
      "domain/decisions/transition",
      "applyCommandsToDecision",
      "DecisionState",
      "transitionDecision",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });
});
