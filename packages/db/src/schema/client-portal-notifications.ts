import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { workOrders } from "./work-orders";

export const clientPortalNotifications = pgTable(
  "client_portal_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "client_portal_notifications_type_check",
      sql`${table.type} in ('REQUEST_CONVERTED', 'VISIT_CONFIRMED')`,
    ),
    unique("client_portal_notifications_client_dedupe_unique").on(
      table.clientId,
      table.dedupeKey,
    ),
    index("client_portal_notifications_client_created_idx").on(
      table.clientId,
      table.createdAt.desc(),
    ),
  ],
);

export type ClientPortalNotificationRow =
  typeof clientPortalNotifications.$inferSelect;
