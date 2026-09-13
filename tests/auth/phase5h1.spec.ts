import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveSafeCallbackUrl } from "@/lib/auth/callbackUrl";
import { createAuthConfig } from "@/lib/auth/config";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  SIGN_OUT_REDIRECT_PATH,
  clearedActiveOrganizationCookie,
} from "@/lib/auth/cookies";
import {
  isMicrosoftEntraIssuer,
  requireProductionAuthConfig,
} from "@/lib/auth/env";
import {
  isMagicLinkPresentedToPilot,
  PILOT_SIGN_IN_DESCRIPTION,
} from "@/lib/auth/pilotSignIn";
import { createAuthProviders } from "@/lib/auth/providers";
import { getRuntimeMode, isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { MemoryOperationalStore } from "@/lib/operations/memoryBackend";
import { createDemoProjectRepository } from "@/lib/repositories/demoProjectRepository";
import { selectProjectRepository } from "@/lib/repositories/selectProjectRepository";
import { createProductionWorkspacePorts } from "@/lib/workspace/productionPorts";
import {
  ACTOR_USER_ID,
  HARBOR_POINT_OPERATIONAL_AT,
  HARBOR_POINT_ORGANIZATION_ID,
  HARBOR_POINT_PROJECT_ID,
} from "@/tests/repositories/recordsFactory";

const PRODUCTION_FIXTURE = {
  PULSEBUILD_RUNTIME_MODE: "production",
  DATABASE_URL: "postgres://phase5h1-fixture.example/db",
  AUTH_SECRET: "phase5h1-test-auth-secret-not-for-production",
  AUTH_MICROSOFT_ENTRA_ID_ID: "phase5h1-test-entra-id",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "phase5h1-test-entra-secret",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER:
    "https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0",
  AUTH_URL: "https://pilot.example.test",
} as const;

function providerIds(production: boolean): string[] {
  return createAuthProviders({
    production,
    entraClientId: PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ID,
    entraClientSecret: PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    entraIssuer: PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  }).map((provider) => provider.id);
}

describe("Phase 5H.1 production environment contract", () => {
  it("requires issuer and AUTH_URL in production", () => {
    expect(() =>
      requireProductionAuthConfig({
        PULSEBUILD_RUNTIME_MODE: "production",
        DATABASE_URL: PRODUCTION_FIXTURE.DATABASE_URL,
        AUTH_SECRET: PRODUCTION_FIXTURE.AUTH_SECRET,
        AUTH_MICROSOFT_ENTRA_ID_ID: PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ID,
        AUTH_MICROSOFT_ENTRA_ID_SECRET:
          PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      }),
    ).toThrow(/AUTH_MICROSOFT_ENTRA_ID_ISSUER|AUTH_URL/);
  });

  it("accepts a complete fixture and keeps the Entra issuer", () => {
    const config = requireProductionAuthConfig(PRODUCTION_FIXTURE);
    expect(config.entraIssuer).toBe(PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
    expect(config.authUrl).toBe(PRODUCTION_FIXTURE.AUTH_URL);
  });

  it("rejects credentialed or non-https AUTH_URL values", () => {
    expect(() =>
      requireProductionAuthConfig({
        ...PRODUCTION_FIXTURE,
        AUTH_URL: "https://user:pass@pilot.example.test",
      }),
    ).toThrow(/AUTH_URL/);
    expect(() =>
      requireProductionAuthConfig({
        ...PRODUCTION_FIXTURE,
        AUTH_URL: "http://pilot.example.test",
      }),
    ).toThrow(/AUTH_URL/);
  });

  it("does not load production auth config in demo mode", () => {
    expect(() =>
      requireProductionAuthConfig({
        ...PRODUCTION_FIXTURE,
        PULSEBUILD_RUNTIME_MODE: "demo",
      }),
    ).toThrow(/only loaded when PULSEBUILD_RUNTIME_MODE=production/);
  });

  it("fails closed when production auth configuration is incomplete", () => {
    expect(() =>
      createAuthConfig({ PULSEBUILD_RUNTIME_MODE: "production" }),
    ).toThrow(/Missing production auth configuration/);
  });
});

describe("Phase 5H.1 Entra issuer pinning", () => {
  it("accepts a tenant-pinned Microsoft Entra issuer", () => {
    expect(isMicrosoftEntraIssuer(PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ISSUER)).toBe(
      true,
    );
    expect(
      isMicrosoftEntraIssuer(
        "https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0",
      ),
    ).toBe(true);
  });

  it("rejects a non-Microsoft HTTPS host", () => {
    expect(isMicrosoftEntraIssuer("https://evil.example/anything")).toBe(false);
    expect(() =>
      requireProductionAuthConfig({
        ...PRODUCTION_FIXTURE,
        AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://evil.example/anything",
      }),
    ).toThrow(/Microsoft Entra tenant issuer/);
  });

  it("rejects malformed or multi-tenant issuers", () => {
    expect(
      isMicrosoftEntraIssuer("https://login.microsoftonline.com/common/v2.0"),
    ).toBe(false);
    expect(
      isMicrosoftEntraIssuer(
        "https://login.microsoftonline.com/organizations/v2.0",
      ),
    ).toBe(false);
    expect(
      isMicrosoftEntraIssuer("https://login.microsoftonline.com/not-a-tenant/v2.0"),
    ).toBe(false);
    expect(
      isMicrosoftEntraIssuer(
        "https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555",
      ),
    ).toBe(false);
  });

  it("rejects credentials, query, and fragment on the issuer", () => {
    expect(
      isMicrosoftEntraIssuer(
        "https://user:pass@login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0",
      ),
    ).toBe(false);
    expect(
      isMicrosoftEntraIssuer(
        `${PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ISSUER}?x=1`,
      ),
    ).toBe(false);
    expect(
      isMicrosoftEntraIssuer(
        `${PRODUCTION_FIXTURE.AUTH_MICROSOFT_ENTRA_ID_ISSUER}#frag`,
      ),
    ).toBe(false);
  });
});

describe("Phase 5H.1 runtime isolation", () => {
  it("lets explicit production mode win over VITEST", () => {
    expect(
      getRuntimeMode({
        PULSEBUILD_RUNTIME_MODE: "production",
        VITEST: "true",
      }),
    ).toBe("production");
    expect(
      isProductionRuntime({
        PULSEBUILD_RUNTIME_MODE: "production",
        VITEST: "true",
      }),
    ).toBe(true);
  });

  it("fails closed on hosted Vercel preview when mode is missing", () => {
    expect(() => getRuntimeMode({ VERCEL_ENV: "preview" })).toThrow(
      /PULSEBUILD_RUNTIME_MODE is required/,
    );
  });

  it("rejects explicit demo on hosted Vercel production and preview", () => {
    expect(() =>
      getRuntimeMode({
        VERCEL_ENV: "production",
        PULSEBUILD_RUNTIME_MODE: "demo",
      }),
    ).toThrow(/demo is not allowed/);
    expect(() =>
      getRuntimeMode({
        VERCEL_ENV: "preview",
        PULSEBUILD_RUNTIME_MODE: "demo",
      }),
    ).toThrow(/demo is not allowed/);
  });

  it("still allows production on hosted Vercel environments", () => {
    expect(
      getRuntimeMode({
        VERCEL_ENV: "preview",
        PULSEBUILD_RUNTIME_MODE: "production",
      }),
    ).toBe("production");
  });

  it("does not select Harbor Point when production is set during tests", async () => {
    const repository = selectProjectRepository({
      PULSEBUILD_RUNTIME_MODE: "production",
      VITEST: "true",
    });
    const result = await repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: HARBOR_POINT_ORGANIZATION_ID,
        actorUserId: ACTOR_USER_ID,
      },
      projectId: HARBOR_POINT_PROJECT_ID,
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(result.status).toBe("DatabaseUnavailable");
  });

  it("keeps the demo repository on the Harbor Point path only", async () => {
    const demo = createDemoProjectRepository();
    const result = await demo.loadProjectSnapshot({
      tenantScope: {
        organizationId: "org-other",
        actorUserId: ACTOR_USER_ID,
      },
      projectId: "proj-other",
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(result.status).toBe("Loaded");
    if (result.status === "Loaded") {
      expect(result.snapshot.project.id).toBe(HARBOR_POINT_PROJECT_ID);
      expect(result.snapshot.scenarioFixtures).toHaveLength(5);
    }
  });

  it("does not open MemoryOperationalStore from production workspace ports", () => {
    const ports = createProductionWorkspacePorts();
    expect(ports.status).toBe("DatabaseUnavailable");
    expect(ports).not.toHaveProperty("operationalStore");
    expect(new MemoryOperationalStore()).toBeInstanceOf(MemoryOperationalStore);
  });

  it("fails closed when DATABASE_URL is missing in production", () => {
    expect(() =>
      getDb({ PULSEBUILD_RUNTIME_MODE: "production" }),
    ).toThrow(/DATABASE_URL is required/);
  });
});

describe("Phase 5H.1 callbackUrl safety", () => {
  it("returns approved internal destinations", () => {
    expect(resolveSafeCallbackUrl("/projects")).toBe("/projects");
    expect(resolveSafeCallbackUrl("/projects/proj_abc")).toBe("/projects/proj_abc");
    expect(resolveSafeCallbackUrl("/projects/import/imp_1")).toBe(
      "/projects/import/imp_1",
    );
    expect(resolveSafeCallbackUrl("/select-organization")).toBe(
      "/select-organization",
    );
  });

  it("rejects external, encoded, and nested open-redirect attempts", () => {
    expect(resolveSafeCallbackUrl("https://evil.example/phish")).toBe("/");
    expect(resolveSafeCallbackUrl("//evil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("/\\evil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("https:%2F%2Fevil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("%252F%252Fevil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("/%2F%2Fevil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("/%5Cevil.example")).toBe("/");
    expect(resolveSafeCallbackUrl("/projects/%2e%2e/secret")).toBe("/");
    expect(resolveSafeCallbackUrl("/projects/foo/../../../etc")).toBe("/");
    expect(resolveSafeCallbackUrl("/projects/%00hidden")).toBe("/");
    expect(resolveSafeCallbackUrl("%E0%A4%A")).toBe("/");
    expect(resolveSafeCallbackUrl("/projects?next=https://evil.example")).toBe(
      "/",
    );
    expect(resolveSafeCallbackUrl("/api/auth/callback/microsoft-entra-id")).toBe(
      "/",
    );
    expect(resolveSafeCallbackUrl("/api/auth/signin/email")).toBe("/");
    expect(resolveSafeCallbackUrl("/projects/../secret")).toBe("/");
    expect(resolveSafeCallbackUrl("")).toBe("/");
    expect(resolveSafeCallbackUrl(null)).toBe("/");
  });
});

describe("Phase 5H.1 sign-out cookie", () => {
  it("clears the active-organization cookie without exposing a tenant id", () => {
    const cleared = clearedActiveOrganizationCookie(true);
    expect(cleared.name).toBe(ACTIVE_ORGANIZATION_COOKIE);
    expect(cleared.value).toBe("");
    expect(cleared.options.maxAge).toBe(0);
    expect(cleared.options.httpOnly).toBe(true);
    expect(cleared.options.path).toBe("/");
    expect(cleared.options.secure).toBe(true);
    expect(SIGN_OUT_REDIRECT_PATH).toBe("/sign-in");
  });

  it("wires sign-out through the workspace chrome", () => {
    const projects = readFileSync("app/projects/page.tsx", "utf8");
    const topBar = readFileSync("components/command-center/CommandTopBar.tsx", "utf8");
    const button = readFileSync("components/auth/SignOutButton.tsx", "utf8");
    const actions = readFileSync("lib/auth/actions.ts", "utf8");
    expect(projects.includes("SignOutButton")).toBe(true);
    expect(topBar.includes("SignOutButton")).toBe(true);
    expect(button.includes("signOutAction")).toBe(true);
    expect(actions.includes("clearedActiveOrganizationCookie")).toBe(true);
    expect(actions.includes("SIGN_OUT_REDIRECT_PATH")).toBe(true);
  });
});

describe("Phase 5H.1 Entra-only pilot surface", () => {
  it("does not present magic-link to production pilot users", () => {
    expect(isMagicLinkPresentedToPilot(true)).toBe(false);
    expect(isMagicLinkPresentedToPilot(false)).toBe(true);
    expect(PILOT_SIGN_IN_DESCRIPTION).toMatch(/Microsoft Entra ID is the only sign-in method/);
  });

  it("registers only Entra in production Auth.js configuration", () => {
    expect(providerIds(true)).toEqual(["microsoft-entra-id"]);
    expect(providerIds(false)).toEqual(["microsoft-entra-id", "email"]);
  });

  it("hides the magic-link form on the production sign-in page", () => {
    const page = readFileSync("app/sign-in/page.tsx", "utf8");
    const panel = readFileSync("components/auth/SignInPanel.tsx", "utf8");
    const provider = readFileSync("lib/auth/magicLinkProvider.ts", "utf8");
    expect(page.includes("entraOnly={production}")).toBe(true);
    expect(panel.includes("isMagicLinkPresentedToPilot")).toBe(true);
    expect(provider.includes("MagicLinkTransportNotConfiguredError")).toBe(true);
    expect(provider.includes("RESEND")).toBe(false);
    expect(provider.includes("SMTP")).toBe(false);
  });
});
