/**
 * Identity and organization ownership tables.
 *
 * Users are global. Organizations are the tenant root.
 * Construction records do not carry organizationId; they hang off Project.
 */

import {
  foreignKey,
  index,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { organizationRoleEnum } from "@/drizzle/schema/enums";
import { utcTimestamp, utcTimestampNullable } from "@/drizzle/schema/columns";

/**
 * PulseBuild User plus the Auth.js adapter user columns.
 * Domain User still exposes displayName; Auth.js reads this as `name`.
 * emailVerified/image are persistence-only and are not domain User fields.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("display_name"),
  email: text("email").notNull(),
  emailVerified: utcTimestampNullable("email_verified"),
  image: text("image"),
  createdAt: utcTimestamp("created_at").defaultNow(),
  updatedAt: utcTimestamp("updated_at").defaultNow(),
}, (table) => [
  unique("users_email_unique").on(table.email),
]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: utcTimestamp("created_at").defaultNow(),
  updatedAt: utcTimestamp("updated_at").defaultNow(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: organizationRoleEnum("role").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("organization_memberships_user_org_unique").on(
      table.userId,
      table.organizationId,
    ),
    index("organization_memberships_organization_id_idx").on(
      table.organizationId,
    ),
    foreignKey({
      name: "organization_memberships_user_id_fk",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "organization_memberships_organization_id_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
  ],
);
