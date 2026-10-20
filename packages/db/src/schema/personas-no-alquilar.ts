import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Referencia a una imagen guardada en el bucket privado `blacklist`. */
export interface FotoRef {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Lista negra de personas a las que nunca se debe alquilar.
 * Registro manual: nombre, documento (DNI), teléfono y una o varias fotos
 * (objetos del bucket privado `blacklist`, referenciados por `fotos`).
 */
export const personasNoAlquilar = pgTable(
  "personas_no_alquilar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombres: varchar("nombres", { length: 255 }).notNull(),
    documentoIdentidad: varchar("documento_identidad", { length: 50 }).notNull(),
    telefono: varchar("telefono", { length: 30 }),
    fotos: jsonb("fotos")
      .$type<FotoRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    creadoPor: varchar("creado_por", { length: 255 }),
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("personas_no_alquilar_documento_idx").on(table.documentoIdentidad),
  ]
);

export type PersonaNoAlquilarRow = typeof personasNoAlquilar.$inferSelect;
export type NewPersonaNoAlquilarRow = typeof personasNoAlquilar.$inferInsert;
