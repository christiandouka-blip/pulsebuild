import type { EnvRecord } from "@/lib/auth/runtimeMode";

export const ACTIVE_ORGANIZATION_COOKIE = "pulsebuild.active_organization";
export const SIGN_OUT_REDIRECT_PATH = "/sign-in";

export function activeOrganizationCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
}

export function clearedActiveOrganizationCookie(secure: boolean) {
  return {
    name: ACTIVE_ORGANIZATION_COOKIE,
    value: "",
    options: {
      ...activeOrganizationCookieOptions(secure),
      maxAge: 0,
    },
  };
}

export function shouldUseSecureCookies(
  env: EnvRecord = process.env,
): boolean {
  if (env.AUTH_URL?.startsWith("https://")) return true;
  if (env.VERCEL_ENV === "production") return true;
  if (env.NODE_ENV === "production" && env.PULSEBUILD_RUNTIME_MODE === "production") {
    return true;
  }
  return false;
}
