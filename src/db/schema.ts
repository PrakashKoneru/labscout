import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Throwaway table whose only job is to prove the browser → route handler →
 * Postgres path works. Drop it once real tables exist.
 */
export const pings = pgTable("pings", {
  id: serial("id").primaryKey(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
