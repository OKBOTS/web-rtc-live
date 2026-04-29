import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const roomsTable = pgTable("rooms", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  hostName: text("host_name").notNull(),
  sourceType: text("source_type").notNull(),
  hostTokenHash: text("host_token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  peakListeners: integer("peak_listeners").notNull().default(0),
});

export type Room = typeof roomsTable.$inferSelect;
export type InsertRoom = typeof roomsTable.$inferInsert;
