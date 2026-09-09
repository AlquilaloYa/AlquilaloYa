import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contracts } from "./contracts";

/**
 * Registro de pagos mensuales de un contrato (Fase 3 - pagos).
 * - Un registro por contract_id + periodo (fecha de vencimiento de la cuota).
 * - voucher_url guarda el baucher (dataURL base64) subido por el operador.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id),
    periodo: date("periodo").notNull(),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 })
      .notNull()
      .default("50"),
    penalidad: numeric("penalidad", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    fechaPago: date("fecha_pago"),
    voucherNombre: varchar("voucher_nombre", { length: 255 }),
    voucherUrl: text("voucher_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("payments_contract_periodo_key").on(table.contractId, table.periodo),
    index("payments_contract_idx").on(table.contractId),
  ]
);

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;
