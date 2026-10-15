import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Lista negra de personas a las que nunca se debe alquilar.
 * Registro manual: nombre, documento (DNI), teléfono y foto del DNI
 * (objeto en el storage privado, referenciado por foto_storage_key).
 */
export const personasNoAlquilar = pgTable(
  "personas_no_alquilar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombres: varchar("nombres", { length: 255 }).notNull(),
    documentoIdentidad: varchar("documento_identidad", { length: 50 }).notNull(),
    telefono: varchar("telefono", { length: 30 }),
    fotoStorageKey: text("foto_storage_key"),
    fotoMimeType: varchar("foto_mime_type", { length: 100 }),
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
