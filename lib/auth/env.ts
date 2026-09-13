/**
 * Required production environment (server-only):
 *
 * PULSEBUILD_RUNTIME_MODE=production
 * DATABASE_URL
 * AUTH_SECRET
 * AUTH_MICROSOFT_ENTRA_ID_ID
 * AUTH_MICROSOFT_ENTRA_ID_SECRET
 * AUTH_MICROSOFT_ENTRA_ID_ISSUER (recommended; Entra tenant issuer URL)
 *
 * Optional:
 * AUTH_URL
 *
 * Magic-link transport is intentionally unset until Product Owner approves
 * an email delivery provider. Do not add RESEND_API_KEY / SMTP vendor vars.
 */

import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";

export type ProductionAuthConfig = {
  authSecret: string;
  databaseUrl: string;
  entraClientId: string;
  entraClientSecret: string;
  entraIssuer: string | undefined;
};

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

  if (!authSecret) missing.push("AUTH_SECRET");
  if (!databaseUrl) missing.push("DATABASE_URL");
  if (!entraClientId) missing.push("AUTH_MICROSOFT_ENTRA_ID_ID");
  if (!entraClientSecret) missing.push("AUTH_MICROSOFT_ENTRA_ID_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Missing production auth configuration: ${missing.join(", ")}.`,
    );
  }

  return {
    authSecret: authSecret!,
    databaseUrl: databaseUrl!,
    entraClientId: entraClientId!,
    entraClientSecret: entraClientSecret!,
    entraIssuer: entraIssuer || undefined,
  };
}
