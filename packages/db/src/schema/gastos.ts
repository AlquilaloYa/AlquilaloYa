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

export type GastoTipo = "SERVICIO" | "PRODUCTO";

/** Referencia a un comprobante guardado en el bucket privado `gastos`. */
export interface ComprobanteRef {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Gasto registrado manualmente desde Contabilidad.
 *
 * - `dia`: fecha del gasto (YYYY-MM-DD).
 * - `tipo`: SERVICIO o PRODUCTO.
 * - `producto`: descripción del bien o servicio.
 * - `monto`: importe en soles (siempre positivo).
 * - `comprobante`: foto opcional del comprobante, en el bucket privado `gastos`.
 */
export const gastos = pgTable(
  "gastos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dia: date("dia").notNull(),
    tipo: varchar("tipo", { length: 20 }).notNull().default("PRODUCTO"),
    producto: varchar("producto", { length: 255 }).notNull(),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    comprobante: text("comprobante"),
    comprobanteMimeType: varchar("comprobante_mime_type", { length: 100 }),
    nota: text("nota").notNull().default(""),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gastos_dia_idx").on(table.dia),
    index("gastos_tipo_idx").on(table.tipo),
  ],
);

export type GastoRow = typeof gastos.$inferSelect;
export type NewGastoRow = typeof gastos.$inferInsert;
