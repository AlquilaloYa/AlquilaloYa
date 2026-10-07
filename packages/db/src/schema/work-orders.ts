import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { hrEmployees } from "./hr";
import { users } from "./users";
import { clients } from "./clients";
import { departments } from "./departments";

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    issueType: varchar("issue_type", { length: 80 }).notNull(),
    priority: varchar("priority", { length: 20 }).notNull().default("MEDIA"),
    status: varchar("status", { length: 30 }).notNull().default("CREATED"),
    location: text("location").notNull(),
    contactName: varchar("contact_name", { length: 255 }).notNull().default(""),
    site: varchar("site", { length: 20 }).notNull(),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    departmentCode: varchar("department_code", { length: 50 }).notNull(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    assignedEmployeeId: uuid("assigned_employee_id").references(
      () => hrEmployees.id,
      {
        onDelete: "set null",
      },
    ),
    targetAt: timestamp("target_at", { withTimezone: true }),
    diagnosis: text("diagnosis").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
    actualCost: numeric("actual_cost", { precision: 12, scale: 2 }),
    estimatedMinutes: numeric("estimated_minutes", { precision: 8, scale: 0 }),
    actualMinutes: numeric("actual_minutes", { precision: 8, scale: 0 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "work_orders_priority_check",
      sql`${table.priority} in ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')`,
    ),
    check(
      "work_orders_site_check",
      sql`${table.site} in ('Angamos', 'Benavides')`,
    ),
    check(
      "work_orders_status_check",
      sql`${table.status} in ('CREATED', 'ASSIGNED', 'REASSIGNED', 'ACCEPTED', 'VISIT_SCHEDULED', 'ON_SITE', 'DIAGNOSIS', 'ESTIMATED', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED', 'REJECTED', 'BLOCKED', 'CANCELLED', 'RESCHEDULED')`,
    ),
    check("work_orders_estimated_cost_check", sql`${table.estimatedCost} >= 0`),
    check("work_orders_actual_cost_check", sql`${table.actualCost} >= 0`),
    check(
      "work_orders_estimated_minutes_check",
      sql`${table.estimatedMinutes} >= 0`,
    ),
    check("work_orders_actual_minutes_check", sql`${table.actualMinutes} >= 0`),
    index("work_orders_status_idx").on(table.status),
    index("work_orders_priority_idx").on(table.priority),
    index("work_orders_assignee_idx").on(table.assignedEmployeeId),
    index("work_orders_target_idx").on(table.targetAt),
    index("work_orders_created_idx").on(table.createdAt),
  ],
);

export const workOrderAssignments = pgTable(
  "work_order_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => hrEmployees.id),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note").notNull().default(""),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("work_order_assignments_order_idx").on(table.workOrderId),
    index("work_order_assignments_employee_idx").on(table.employeeId),
    uniqueIndex("work_order_assignments_active_order_idx")
      .on(table.workOrderId)
      .where(sql`${table.endedAt} IS NULL`),
  ],
);

export const workOrderVisits = pgTable(
  "work_order_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    visitNumber: numeric("visit_number", { precision: 5, scale: 0 }).notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    diagnosis: text("diagnosis").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("work_order_visits_order_idx").on(
      table.workOrderId,
      table.visitNumber,
    ),
    unique("work_order_visits_order_visit_unique").on(
      table.workOrderId,
      table.visitNumber,
    ),
    check("work_order_visits_number_check", sql`${table.visitNumber} > 0`),
  ],
);

export const workOrderEvents = pgTable(
  "work_order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorName: varchar("actor_name", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    fromStatus: varchar("from_status", { length: 30 }),
    toStatus: varchar("to_status", { length: 30 }),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("work_order_events_order_idx").on(table.workOrderId, table.createdAt),
  ],
);

export const workOrderAttachments = pgTable(
  "work_order_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 80 }).notNull(),
    sizeBytes: numeric("size_bytes", { precision: 12, scale: 0 }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "work_order_attachments_mime_type_check",
      sql`${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      "work_order_attachments_size_bytes_check",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 8388608`,
    ),
    index("work_order_attachments_order_idx").on(
      table.workOrderId,
      table.createdAt,
    ),
  ],
);

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type NewWorkOrderRow = typeof workOrders.$inferInsert;
