import { eq } from "drizzle-orm";

import type { OrganizationRole } from "@/domain/tenancy/types";
import { organizationMemberships, organizations } from "@/drizzle/schema";
import type { Database } from "@/lib/db/client";

export type UserOrganizationOption = {
  id: string;
  name: string;
  role: OrganizationRole;
};

export async function listUserOrganizations(
  db: Database,
  userId: string,
): Promise<UserOrganizationOption[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.organizationId),
    )
    .where(eq(organizationMemberships.userId, userId));
  return rows;
}
