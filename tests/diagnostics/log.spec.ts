import { describe, expect, it } from "vitest";

import {
  containsUnsafeDiagnostic,
  serializePilotLog,
} from "@/lib/diagnostics/log";

describe("Phase 5H.1 diagnostic redaction", () => {
  it("serializes allowlisted failure events", () => {
    expect(
      serializePilotLog({
        area: "operations",
        outcome: "reconstruction_failed",
        status: "ReconstructionFailure",
      }),
    ).toBe(
      JSON.stringify({
        source: "pulsebuild",
        area: "operations",
        outcome: "reconstruction_failed",
        status: "ReconstructionFailure",
      }),
    );
  });

  it("drops events that include secrets, URLs, or emails", () => {
    expect(
      serializePilotLog({
        area: "auth",
        outcome: "AUTH_SECRET=super-secret",
      }),
    ).toBeNull();
    expect(
      serializePilotLog({
        area: "database",
        outcome: "postgres://user:pass@host/db",
      }),
    ).toBeNull();
    expect(
      serializePilotLog({
        area: "import",
        outcome: "owner@example.com",
      }),
    ).toBeNull();
  });

  it("rejects unexpected shapes and non-string fields", () => {
    expect(serializePilotLog(new Error("DATABASE_URL=secret"))).toBeNull();
    expect(serializePilotLog(["operations", "commit_failed"])).toBeNull();
    expect(
      serializePilotLog({
        area: "operations",
        outcome: { nested: "secret" },
      }),
    ).toBeNull();
    expect(
      serializePilotLog({
        area: "operations",
        outcome: "reconstruction_failed",
        status: { leaked: "cookie=abc" },
      }),
    ).toBeNull();
  });

  it("does not serialize extra nested fields", () => {
    const line = serializePilotLog({
      area: "import",
      outcome: "rejected",
      extra: { file: "customer.xlsx", email: "owner@example.com" },
    });
    expect(line).toBe(
      JSON.stringify({
        source: "pulsebuild",
        area: "import",
        outcome: "rejected",
      }),
    );
    expect(line).not.toContain("customer.xlsx");
    expect(line).not.toContain("owner@example.com");
  });

  it("treats cookie and token material as unsafe", () => {
    expect(containsUnsafeDiagnostic("cookie=abc")).toBe(true);
    expect(containsUnsafeDiagnostic("bearer token value")).toBe(true);
    expect(containsUnsafeDiagnostic("unavailable")).toBe(false);
  });
});
