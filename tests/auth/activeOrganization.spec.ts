import { describe, expect, it } from "vitest";

import { resolveActiveOrganization } from "@/domain/authorization";
import { makeMembership } from "@/tests/auth/memoryDirectory";

describe("Phase 5B active organization", () => {
  it("selects the only membership without guessing", () => {
    const memberships = [makeMembership("user-1", "org-a", "Owner")];
    const result = resolveActiveOrganization(memberships, null);
    expect(result).toMatchObject({
      status: "resolved",
      organizationId: "org-a",
    });
  });

  it("requires an explicit organization when the user has several", () => {
    const memberships = [
      makeMembership("user-1", "org-a", "Owner"),
      makeMembership("user-1", "org-b", "Viewer"),
    ];
    expect(resolveActiveOrganization(memberships, null).status).toBe(
      "ActiveOrganizationRequired",
    );
    const selected = resolveActiveOrganization(memberships, "org-b");
    expect(selected).toMatchObject({
      status: "resolved",
      organizationId: "org-b",
    });
  });

  it("rejects a requested organization the user does not belong to", () => {
    const memberships = [makeMembership("user-1", "org-a", "Owner")];
    expect(resolveActiveOrganization(memberships, "org-b").status).toBe(
      "InvalidActiveOrganization",
    );
  });
});
