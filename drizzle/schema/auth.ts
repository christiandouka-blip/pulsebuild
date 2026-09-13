/**
 * Auth.js adapter tables. Provider-specific; not PulseBuild operational domain.
 *
 * Cascade on accounts/sessions is the Auth.js adapter contract when a User is
 * removed. PulseBuild organization/project FKs remain ON DELETE restrict.
 */

import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { utcTimestamp } from "@/drizzle/schema/columns";
import { users } from "@/drizzle/schema/identity";

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({
      name: "auth_accounts_provider_provider_account_pk",
      columns: [table.provider, table.providerAccountId],
    }),
  ],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: utcTimestamp("expires"),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: utcTimestamp("expires"),
  },
  (table) => [
    primaryKey({
      name: "auth_verification_tokens_pk",
      columns: [table.identifier, table.token],
    }),
  ],
);
