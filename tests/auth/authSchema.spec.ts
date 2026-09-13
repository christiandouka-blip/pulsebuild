import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  authAccounts,
  authSessions,
  authVerificationTokens,
  organizationMemberships,
  users,
} from "@/drizzle/schema";

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("Phase 5B Auth.js identity tables", () => {
  it("keeps PulseBuild users as the identity root with adapter columns", () => {
    expect(columnNames(users)).toEqual(
      expect.arrayContaining([
        "id",
        "display_name",
        "email",
        "email_verified",
        "image",
        "created_at",
        "updated_at",
      ]),
    );
    expect(columnNames(users)).not.toContain("role");
  });

  it("stores Auth.js accounts, sessions, and verification tokens separately", () => {
    expect(getTableConfig(authAccounts).name).toBe("auth_accounts");
    expect(getTableConfig(authSessions).name).toBe("auth_sessions");
    expect(getTableConfig(authVerificationTokens).name).toBe(
      "auth_verification_tokens",
    );
    expect(columnNames(authAccounts)).toEqual(
      expect.arrayContaining([
        "user_id",
        "provider",
        "provider_account_id",
      ]),
    );
    expect(columnNames(authSessions)).toEqual(
      expect.arrayContaining(["session_token", "user_id", "expires"]),
    );
    expect(columnNames(authVerificationTokens)).toEqual(
      expect.arrayContaining(["identifier", "token", "expires"]),
    );
  });

  it("does not duplicate organization role onto auth adapter tables", () => {
    expect(columnNames(authAccounts)).not.toContain("role");
    expect(columnNames(authSessions)).not.toContain("role");
    expect(columnNames(organizationMemberships)).toContain("role");
  });
});
