import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";
import {
  authAccounts,
  authSessions,
  authVerificationTokens,
  users,
} from "@/drizzle/schema";
import { requireProductionAuthConfig, type ProductionAuthConfig } from "@/lib/auth/env";
import { createAuthProviders } from "@/lib/auth/providers";
import { shouldUseSecureCookies } from "@/lib/auth/cookies";
import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { logPilotEvent } from "@/lib/diagnostics/log";

const DEMO_AUTH_SECRET = "pulsebuild-demo-auth-secret-not-for-production";

export function createAuthConfig(
  env: EnvRecord = process.env,
): NextAuthConfig {
  const production = isProductionRuntime(env);
  let productionConfig: ProductionAuthConfig | null = null;
  if (production) {
    try {
      productionConfig = requireProductionAuthConfig(env);
    } catch (error) {
      logPilotEvent({ area: "auth", outcome: "missing_configuration" });
      throw error;
    }
  }
  const secureCookies = shouldUseSecureCookies(env);

  return {
    trustHost: true,
    secret: productionConfig?.authSecret ?? env.AUTH_SECRET ?? DEMO_AUTH_SECRET,
    session: {
      strategy: production ? "database" : "jwt",
    },
    useSecureCookies: secureCookies,
    adapter: production
      ? DrizzleAdapter(getDb(env), {
          usersTable: users,
          accountsTable: authAccounts,
          sessionsTable: authSessions,
          verificationTokensTable: authVerificationTokens,
        })
      : undefined,
    providers: createAuthProviders({
      production,
      entraClientId:
        productionConfig?.entraClientId ??
        env.AUTH_MICROSOFT_ENTRA_ID_ID ??
        "demo-entra-id-not-configured",
      entraClientSecret:
        productionConfig?.entraClientSecret ??
        env.AUTH_MICROSOFT_ENTRA_ID_SECRET ??
        "demo-entra-secret-not-configured",
      entraIssuer: productionConfig?.entraIssuer ?? env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
    pages: {
      signIn: "/sign-in",
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user?.id) {
          token.sub = user.id;
        }
        return token;
      },
      async session({ session, token, user }) {
        const id = user?.id ?? token.sub;
        if (id) {
          session.user.id = id;
        }
        return session;
      },
    },
  };
}
