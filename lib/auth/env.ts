/**
 * Required production environment (server-only):
 *
 * PULSEBUILD_RUNTIME_MODE=production
 * DATABASE_URL
 * AUTH_SECRET
 * AUTH_MICROSOFT_ENTRA_ID_ID
 * AUTH_MICROSOFT_ENTRA_ID_SECRET
 * AUTH_MICROSOFT_ENTRA_ID_ISSUER
 * AUTH_URL
 *
 * Magic-link transport is intentionally unset. Do not add RESEND_API_KEY,
 * SMTP, SendGrid, Postmark, or other email-vendor variables.
 */

import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";

export type ProductionAuthConfig = {
  authSecret: string;
  databaseUrl: string;
  entraClientId: string;
  entraClientSecret: string;
  entraIssuer: string;
  authUrl: string;
};

const ENTRA_ISSUER_HOST = "login.microsoftonline.com";
const MULTI_TENANT_ISSUERS = new Set(["common", "organizations", "consumers"]);
const TENANT_GUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TENANT_DOMAIN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function requireProductionAuthConfig(
  env: EnvRecord = process.env,
): ProductionAuthConfig {
  if (!isProductionRuntime(env)) {
    throw new Error(
      "Production auth configuration is only loaded when PULSEBUILD_RUNTIME_MODE=production.",
    );
  }

  const missing: string[] = [];
  const authSecret = env.AUTH_SECRET?.trim();
  const databaseUrl = env.DATABASE_URL?.trim();
  const entraClientId = env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim();
  const entraClientSecret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim();
  const entraIssuer = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim();
  const authUrl = env.AUTH_URL?.trim();

  if (!authSecret) missing.push("AUTH_SECRET");
  if (!databaseUrl) missing.push("DATABASE_URL");
  if (!entraClientId) missing.push("AUTH_MICROSOFT_ENTRA_ID_ID");
  if (!entraClientSecret) missing.push("AUTH_MICROSOFT_ENTRA_ID_SECRET");
  if (!entraIssuer) missing.push("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  if (!authUrl) missing.push("AUTH_URL");

  if (missing.length > 0) {
    throw new Error(
      `Missing production auth configuration: ${missing.join(", ")}.`,
    );
  }

  if (!isPinnedHttpsOrigin(authUrl!)) {
    throw new Error("AUTH_URL must be an https origin with no credentials.");
  }
  if (!isMicrosoftEntraIssuer(entraIssuer!)) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER must be a Microsoft Entra tenant issuer URL.",
    );
  }

  return {
    authSecret: authSecret!,
    databaseUrl: databaseUrl!,
    entraClientId: entraClientId!,
    entraClientSecret: entraClientSecret!,
    entraIssuer: entraIssuer!,
    authUrl: authUrl!,
  };
}

export function isMicrosoftEntraIssuer(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== ENTRA_ISSUER_HOST) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;

  const path = parsed.pathname.replace(/\/$/, "");
  const match = /^\/([^/]+)\/v2\.0$/.exec(path);
  if (!match) return false;
  const tenant = match[1] ?? "";
  if (MULTI_TENANT_ISSUERS.has(tenant.toLowerCase())) return false;
  return TENANT_GUID.test(tenant) || TENANT_DOMAIN.test(tenant);
}

function isPinnedHttpsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    Boolean(parsed.hostname) &&
    !parsed.username &&
    !parsed.password
  );
}

function isPinnedHttpsOrigin(value: string): boolean {
  if (!isPinnedHttpsUrl(value)) {
    return false;
  }
  const parsed = new URL(value);
  return parsed.pathname === "/" && !parsed.search && !parsed.hash;
}
