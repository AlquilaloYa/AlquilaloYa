import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { contracts } from "./contracts";
import { users } from "./users";

/**
 * Solicitudes de renovación de contrato enviadas desde el portal de clientes.
 * - Una sola solicitud PENDING por (contrato, cliente): índice único parcial.
 * - El ERP revisa y marca APPROVED / REJECTED; el historial no se borra.
 */
export const clientContractRenewalRequests = pgTable(
  "client_contract_renewal_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    note: text("note"),
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
      "client_contract_renewal_status_check",
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    uniqueIndex("client_contract_renewal_open_unique")
      .on(table.contractId, table.clientId)
      .where(sql`${table.status} = 'PENDING'`),
    index("client_contract_renewal_contract_created_idx").on(
      table.contractId,
      table.createdAt.desc(),
    ),
  ],
);

export type ClientContractRenewalRequestRow =
  typeof clientContractRenewalRequests.$inferSelect;
