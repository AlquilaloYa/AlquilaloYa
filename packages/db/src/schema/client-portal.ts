import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { contracts } from "./contracts";
import { departments } from "./departments";
import { issueTypes } from "./issue-types";
import { users } from "./users";
import { workOrders } from "./work-orders";

export const clientWorkOrderRequests = pgTable(
  "client_work_order_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    issueTypeId: uuid("issue_type_id")
      .notNull()
      .references(() => issueTypes.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    customerPresentAtVisit: boolean("customer_present_at_visit")
      .notNull()
      .default(true),
    availabilityOptions: jsonb("availability_options").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "client_work_order_requests_status_check",
      sql`${table.status} in ('PENDING', 'CONVERTED', 'REJECTED')`,
    ),
    index("client_work_order_requests_client_idx").on(
      table.clientId,
      table.createdAt,
    ),
    index("client_work_order_requests_status_idx").on(
      table.status,
      table.createdAt,
    ),
    unique("client_work_order_requests_work_order_unique").on(table.workOrderId),
  ],
);

export const clientPortalUploads = pgTable(
  "client_portal_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 80 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    requestId: uuid("request_id").references(
      () => clientWorkOrderRequests.id,
      { onDelete: "cascade" },
    ),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "client_portal_uploads_mime_type_check",
      sql`${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')`,
    ),
    check(
      "client_portal_uploads_size_bytes_check",
      sql`${table.sizeBytes} between 1 and 8388608`,
    ),
    index("client_portal_uploads_client_idx").on(table.clientId, table.createdAt),
    index("client_portal_uploads_order_idx").on(table.workOrderId),
  ],
);

export const clientPortalAccounts = pgTable(
  "client_portal_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    authUserId: uuid("auth_user_id").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    contractId: uuid("contract_id").references(() => contracts.id, {
      onDelete: "set null",
    }),
    credentialPeriodKey: varchar("credential_period_key", { length: 255 }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("client_portal_accounts_client_unique").on(table.clientId),
    unique("client_portal_accounts_auth_unique").on(table.authUserId),
    index("client_portal_accounts_email_idx").on(table.email),
  ],
);

export const clientPortalRateLimits = pgTable(
  "client_portal_rate_limits",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("client_portal_rate_limits_window_idx").on(table.windowStartedAt)],
);

export const workOrderAvailabilityOptions = pgTable(
  "work_order_availability_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    optionNumber: integer("option_number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    selectedBy: uuid("selected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("work_order_availability_option_unique").on(
      table.workOrderId,
      table.optionNumber,
    ),
    check(
      "work_order_availability_window_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    uniqueIndex("work_order_availability_selected_unique")
      .on(table.workOrderId)
      .where(sql`${table.selectedAt} IS NOT NULL`),
    index("work_order_availability_order_idx").on(table.workOrderId),
  ],
);

export const workOrderChats = pgTable(
  "work_order_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("work_order_chats_work_order_unique").on(table.workOrderId),
    index("work_order_chats_open_idx").on(table.closedAt, table.openedAt),
  ],
);

export const workOrderChatMessages = pgTable(
  "work_order_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => workOrderChats.id, { onDelete: "cascade" }),
    senderType: varchar("sender_type", { length: 20 }).notNull(),
    senderId: uuid("sender_id"),
    senderName: varchar("sender_name", { length: 255 }).notNull(),
    encryptedContent: text("encrypted_content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "work_order_chat_sender_type_check",
      sql`${table.senderType} in ('CLIENT', 'EMPLOYEE', 'SYSTEM')`,
    ),
    index("work_order_chat_messages_chat_idx").on(
      table.chatId,
      table.createdAt,
    ),
  ],
);

export type ClientPortalAccountRow = typeof clientPortalAccounts.$inferSelect;
export type ClientWorkOrderRequestRow =
  typeof clientWorkOrderRequests.$inferSelect;
export type WorkOrderAvailabilityOptionRow =
  typeof workOrderAvailabilityOptions.$inferSelect;
export type WorkOrderChatRow = typeof workOrderChats.$inferSelect;
export type WorkOrderChatMessageRow = typeof workOrderChatMessages.$inferSelect;
