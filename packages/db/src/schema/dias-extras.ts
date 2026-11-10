import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contracts } from "./contracts";

export const diasExtras = pgTable(
  "dias_extras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    dias: integer("dias").notNull(),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull(),
    fechaFinPeriodo: date("fecha_fin_periodo").notNull(),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    fechaPago: date("fecha_pago"),
    voucherFilename: varchar("voucher_filename", { length: 255 }),
    voucherStorageKey: text("voucher_storage_key"),
    voucherMimeType: varchar("voucher_mime_type", { length: 100 }),
    creadoPor: varchar("creado_por", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("dias_extras_dias_limit_check", sql`${table.dias} BETWEEN 1 AND 7`),
    check("dias_extras_monto_check", sql`${table.monto} = ${table.dias} * 100`),
    index("dias_extras_contract_periodo_idx").on(table.contractId, table.fechaFinPeriodo),
  ],
);

export type DiasExtrasRow = typeof diasExtras.$inferSelect;
export type NewDiasExtrasRow = typeof diasExtras.$inferInsert;
