import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    href: varchar("href", { length: 500 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notifications_user_dedupe_unique").on(
      table.userId,
      table.dedupeKey,
    ),
    index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("notifications_user_unread_idx")
      .on(table.userId, table.createdAt.desc())
      .where(sql`${table.isRead} = false AND ${table.isActive} = true`),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
