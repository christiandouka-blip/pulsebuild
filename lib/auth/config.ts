import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import {
  authAccounts,
  authSessions,
  authVerificationTokens,
  users,
} from "@/drizzle/schema";
import { requireProductionAuthConfig } from "@/lib/auth/env";
import { createMagicLinkProvider } from "@/lib/auth/magicLinkProvider";
import { shouldUseSecureCookies } from "@/lib/auth/cookies";
import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";

const DEMO_AUTH_SECRET = "pulsebuild-demo-auth-secret-not-for-production";

export function createAuthConfig(
  env: EnvRecord = process.env,
): NextAuthConfig {
  const production = isProductionRuntime(env);
  const productionConfig = production
    ? requireProductionAuthConfig(env)
    : null;
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
    providers: [
      MicrosoftEntraID({
        clientId:
          productionConfig?.entraClientId ??
          env.AUTH_MICROSOFT_ENTRA_ID_ID ??
          "demo-entra-id-not-configured",
        clientSecret:
          productionConfig?.entraClientSecret ??
          env.AUTH_MICROSOFT_ENTRA_ID_SECRET ??
          "demo-entra-secret-not-configured",
        issuer: productionConfig?.entraIssuer ?? env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
      createMagicLinkProvider(),
    ],
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
