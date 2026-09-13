import { timestamp } from "drizzle-orm/pg-core";

/** UTC timestamptz. Database default now() is SQL-side, not Date.now() in engines. */
export const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

export const utcTimestampNullable = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
