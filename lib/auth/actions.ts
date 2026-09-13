"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAuthorized } from "@/domain/authorization/types";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import { authorizeOrganizationContext } from "@/lib/auth/authorize";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  activeOrganizationCookieOptions,
  shouldUseSecureCookies,
} from "@/lib/auth/cookies";
import { MagicLinkTransportNotConfiguredError } from "@/lib/auth/magicLink";
import { auth, signIn, signOut } from "@/lib/auth/nextAuth";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { createDrizzleIdentityDirectory } from "@/lib/db/identityDirectory";

export async function signInWithEntraAction() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function signInWithMagicLinkAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required." };
  }
  try {
    await signIn("email", { email, redirectTo: "/" });
  } catch (error) {
    if (error instanceof MagicLinkTransportNotConfiguredError) {
      return {
        error:
          "Email magic-link delivery is not configured. Sign in with Microsoft Entra ID.",
      };
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

export async function selectOrganizationAction(formData: FormData) {
  if (!isProductionRuntime()) {
    throw new Error("Organization selection requires production runtime.");
  }

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const result = await authorizeOrganizationContext({
    identity,
    organizationId,
    directory: createDrizzleIdentityDirectory(getDb()),
  });

  if (!isAuthorized(result)) {
    throw new Error("Active organization is not valid for this user.");
  }

  const jar = await cookies();
  jar.set(
    ACTIVE_ORGANIZATION_COOKIE,
    organizationId,
    activeOrganizationCookieOptions(shouldUseSecureCookies()),
  );
  redirect("/");
}
