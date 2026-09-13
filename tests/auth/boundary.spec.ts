import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runAuthorizedWorkflow } from "@/lib/auth/workflowGate";

describe("Phase 5B workflow authorization gate", () => {
  it("denied authorization never invokes the workflow command helper", () => {
    let invoked = false;
    const result = runAuthorizedWorkflow(
      { status: "CapabilityDenied", capability: "decision:approve" },
      () => {
        invoked = true;
        return "workflow-ran";
      },
    );
    expect(invoked).toBe(false);
    expect(result).toEqual({
      status: "CapabilityDenied",
      capability: "decision:approve",
    });
  });

  it("authorized requests may invoke a provided workflow helper", () => {
    let invoked = false;
    const result = runAuthorizedWorkflow(
      {
        status: "Authorized",
        scope: { organizationId: "org-a", actorUserId: "user-1" },
        role: "Owner",
        capabilities: ["decision:approve"],
      },
      () => {
        invoked = true;
        return "workflow-ran";
      },
    );
    expect(invoked).toBe(true);
    expect(result).toEqual({ status: "invoked", value: "workflow-ran" });
  });
});

describe("Phase 5B source boundaries", () => {
  const dbTokens = [
    "@/lib/db",
    "@/drizzle",
    "drizzle-orm",
    "DATABASE_URL",
    "next-auth",
    "@auth/drizzle-adapter",
  ];

  const engineFiles = [
    "domain/engines/reasoningPipeline.ts",
    "domain/decisions/runtime.ts",
    "domain/decisions/transition.ts",
    "domain/effects/runtime.ts",
    "domain/recovery/runtime.ts",
    "domain/agent/types.ts",
    "domain/voice/types.ts",
  ];

  const storeFiles = [
    "store/useReasoningStore.ts",
    "store/useVoiceStore.ts",
    "store/useAgentStore.ts",
    "store/useDecisionStore.ts",
    "store/useProjectStore.ts",
  ];

  it("frozen engines import no DB or Auth.js code", () => {
    for (const file of engineFiles) {
      const source = readFileSync(file, "utf8");
      for (const token of dbTokens) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("client stores import no DB, Auth.js, or tenant authority", () => {
    for (const file of storeFiles) {
      const source = readFileSync(file, "utf8");
      for (const token of [
        ...dbTokens,
        "TenantScope",
        "organization:manage_members",
        "roleHasCapability",
        "authorizeProjectRequest",
      ]) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("Harbor Point command center remains demo-runnable without auth DB", () => {
    const source = readFileSync("components/command-center/CommandCenterShell.tsx", "utf8");
    for (const token of [
      ...dbTokens,
      "authorizeCurrentUserForProject",
      "PULSEBUILD_RUNTIME_MODE",
    ]) {
      expect(source.includes(token), `command center contains ${token}`).toBe(
        false,
      );
    }
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page.includes("CommandCenterShell")).toBe(true);
    expect(page.includes("next-auth")).toBe(false);
    expect(page.includes("DATABASE_URL")).toBe(false);
  });

  it("database client is server-only and names DATABASE_URL", () => {
    const source = readFileSync("lib/db/client.ts", "utf8");
    expect(source.includes("DATABASE_URL")).toBe(true);
    expect(source.includes("process.env")).toBe(true);
    expect(source.includes("Never import from components/")).toBe(true);
  });
});
