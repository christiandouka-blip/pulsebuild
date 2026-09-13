import { redirect } from "next/navigation";

import { Button } from "@/components/layout/Button";
import { isAuthorized } from "@/domain/authorization/types";
import { selectOrganizationAction, signOutAction } from "@/lib/auth/actions";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import { authorizeOrganizationContext } from "@/lib/auth/authorize";
import { auth } from "@/lib/auth/nextAuth";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { createDrizzleIdentityDirectory } from "@/lib/db/identityDirectory";
import { listUserOrganizations } from "@/lib/db/listUserOrganizations";

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage() {
  if (!isProductionRuntime()) {
    redirect("/");
  }

  const session = await auth();
  const identity = toAuthPortIdentity(session);
  if (!identity) {
    redirect("/sign-in");
  }

  const directory = createDrizzleIdentityDirectory(getDb());
  const memberships = await directory.listOrganizationMemberships(identity.userId);
  if (memberships.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-command-navy px-4">
        <div className="max-w-md rounded-xl border border-surface-border bg-surface-card p-8">
          <h1 className="text-xl font-semibold text-slate-100">No organization</h1>
          <p className="mt-2 text-sm text-muted-text">
            This account is authenticated but is not a member of an organization.
          </p>
          <form action={signOutAction} className="mt-6">
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const organizations = await listUserOrganizations(getDb(), identity.userId);
  const single = memberships.length === 1 ? memberships[0] : null;
  if (single) {
    const result = await authorizeOrganizationContext({
      identity,
      organizationId: single.organizationId,
      directory,
    });
    if (isAuthorized(result)) {
      redirect("/");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-command-navy px-4">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-card p-8">
        <h1 className="text-xl font-semibold text-slate-100">
          Select organization
        </h1>
        <p className="mt-2 text-sm text-muted-text">
          Your account belongs to more than one organization. Access is checked
          against membership on the server.
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <form action={selectOrganizationAction}>
                <input
                  type="hidden"
                  name="organizationId"
                  value={organization.id}
                />
                <Button type="submit" variant="secondary" className="w-full">
                  {organization.name}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={signOutAction} className="mt-6">
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
