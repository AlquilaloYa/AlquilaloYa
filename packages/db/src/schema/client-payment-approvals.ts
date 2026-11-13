import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  date,
  text,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { contracts } from "./contracts";
import { payments } from "./payments";
import { serviciosExtrasPagos } from "./servicios-extras";
import { users } from "./users";

export const clientPaymentApprovalRequests = pgTable(
  "client_payment_approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "cascade",
    }),
    serviciosExtrasPagoId: uuid("servicios_extras_pago_id").references(
      () => serviciosExtrasPagos.id,
      { onDelete: "cascade" },
    ),
    dueDate: date("due_date").notNull(),
    requestedAmount: numeric("requested_amount", {
      precision: 15,
      scale: 2,
    }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "client_payment_approval_target_check",
      sql`(${table.paymentId} IS NOT NULL) <> (${table.serviciosExtrasPagoId} IS NOT NULL)`,
    ),
    check(
      "client_payment_approval_status_check",
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'USED')`,
    ),
    check(
      "client_payment_approval_amount_positive",
      sql`${table.requestedAmount} > 0`,
    ),
    uniqueIndex("client_payment_approval_payment_open_unique")
      .on(table.paymentId)
      .where(
        sql`${table.paymentId} IS NOT NULL AND ${table.status} IN ('PENDING', 'APPROVED')`,
      ),
    uniqueIndex("client_payment_approval_service_open_unique")
      .on(table.serviciosExtrasPagoId)
      .where(
        sql`${table.serviciosExtrasPagoId} IS NOT NULL AND ${table.status} IN ('PENDING', 'APPROVED')`,
      ),
    index("client_payment_approval_client_created_idx").on(
      table.clientId,
      table.createdAt.desc(),
    ),
    index("client_payment_approval_status_created_idx").on(
      table.status,
      table.createdAt.desc(),
    ),
  ],
);

export type ClientPaymentApprovalRequestRow =
  typeof clientPaymentApprovalRequests.$inferSelect;
