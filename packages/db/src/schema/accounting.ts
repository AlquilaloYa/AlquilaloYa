import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Ajustes manuales de contabilidad (Fase 1 - estados financieros).
 *
 * Cada fila es una línea que el usuario carga a mano para complementar lo que
 * el ERP deriva de sus datos (cobranza, órdenes de trabajo, RRHH).
 *
 * - `periodo`: primer día del mes al que pertenece la línea (YYYY-MM-01).
 * - `estado`: a qué estado financiero alimenta:
 *     RESULTADOS → Estado de Resultados.
 *     FLUJO      → Estado de Flujo de Efectivo.
 *     BALANCE    → Balance General.
 * - `grupo`: agrupación dentro del estado:
 *     RESULTADOS → INGRESO | GASTO
 *     FLUJO      → ENTRADA | SALIDA
 *     BALANCE    → ACTIVO | PASIVO | PATRIMONIO
 * - `etiqueta`: descripción de la línea (p. ej. "Alquiler de oficina").
 * - `monto`: importe en soles (siempre positivo; el grupo define el signo).
 */
export const accountingEntries = pgTable(
  "accounting_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodo: date("periodo").notNull(),
    estado: varchar("estado", { length: 20 }).notNull(),
    grupo: varchar("grupo", { length: 20 }).notNull(),
    etiqueta: varchar("etiqueta", { length: 255 }).notNull(),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    nota: text("nota").notNull().default(""),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounting_entries_periodo_idx").on(table.periodo),
    index("accounting_entries_estado_idx").on(table.periodo, table.estado),
  ]
);

export type AccountingEntryRow = typeof accountingEntries.$inferSelect;
export type NewAccountingEntryRow = typeof accountingEntries.$inferInsert;
