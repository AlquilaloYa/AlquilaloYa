import { sql } from "drizzle-orm";
import {
  check,
  bigint,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const locales = pgTable(
  "locales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: varchar("codigo", { length: 32 }).notNull().unique(),
    sede: varchar("sede", { length: 20 }).notNull(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    areaM2: numeric("area_m2", { precision: 10, scale: 2 }).notNull().default("0"),
    precioAlquiler: numeric("precio_alquiler", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    garantia: numeric("garantia", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    servicios: text("servicios").notNull().default(""),
    pagoLuzPorcentaje: numeric("pago_luz_porcentaje", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "locales_codigo_check",
      sql`${table.codigo} in ('BEN2195-A1', 'BEN2195-A2', 'BEN2195-A3', 'ANG170-A1', 'ANG170-A2', 'ANG170-A3')`,
    ),
    check(
      "locales_sede_check",
      sql`${table.sede} in ('Benavides', 'Angamos')`,
    ),
    check(
      "locales_codigo_sede_check",
      sql`(${table.codigo} like 'BEN2195-%' and ${table.sede} = 'Benavides') or (${table.codigo} like 'ANG170-%' and ${table.sede} = 'Angamos')`,
    ),
    check("locales_area_m2_check", sql`${table.areaM2} >= 0`),
    check("locales_precio_alquiler_check", sql`${table.precioAlquiler} >= 0`),
    check("locales_garantia_check", sql`${table.garantia} >= 0`),
    check("locales_mantenimiento_check", sql`${table.mantenimiento} >= 0`),
    check(
      "locales_pago_luz_porcentaje_check",
      sql`${table.pagoLuzPorcentaje} between 0 and 100`,
    ),
    index("locales_sede_idx").on(table.sede),
  ],
);

export const localFiles = pgTable(
  "local_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedBy: varchar("uploaded_by", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("local_files_local_id_idx").on(table.localId)],
);

export type LocalRow = typeof locales.$inferSelect;
export type NewLocalRow = typeof locales.$inferInsert;
export type LocalFileRow = typeof localFiles.$inferSelect;
