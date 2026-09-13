import { describe, expect, it } from "vitest";

import { requireProductionAuthConfig } from "@/lib/auth/env";
import { getRuntimeMode, isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";

describe("Phase 5B runtime mode", () => {
  it("defaults local and test environments to demo", () => {
    expect(getRuntimeMode({ VITEST: "true" })).toBe("demo");
    expect(getRuntimeMode({})).toBe("demo");
    expect(isProductionRuntime({ VITEST: "true" })).toBe(false);
  });

  it("honors an explicit production mode", () => {
    expect(getRuntimeMode({ PULSEBUILD_RUNTIME_MODE: "production" })).toBe(
      "production",
    );
  });

  it("fails closed in hosted production when mode is missing", () => {
    expect(() => getRuntimeMode({ VERCEL_ENV: "production" })).toThrow(
      /PULSEBUILD_RUNTIME_MODE is required/,
    );
  });

  it("does not throw during Next.js production build when mode is unset", () => {
    expect(
      getRuntimeMode({
        VERCEL_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBe("demo");
  });

  it("does not allow a missing database to authorize production", () => {
    expect(() =>
      getDb({ PULSEBUILD_RUNTIME_MODE: "production" }),
    ).toThrow(/DATABASE_URL is required/);
  });

  it("does not open the database client in demo mode", () => {
    expect(() => getDb({ PULSEBUILD_RUNTIME_MODE: "demo" })).toThrow(
      /unavailable in demo/,
    );
  });

  it("requires Entra and AUTH_SECRET in production", () => {
    expect(() =>
      requireProductionAuthConfig({
        PULSEBUILD_RUNTIME_MODE: "production",
        DATABASE_URL: "postgres://example",
      }),
    ).toThrow(/AUTH_SECRET/);
  });
});
