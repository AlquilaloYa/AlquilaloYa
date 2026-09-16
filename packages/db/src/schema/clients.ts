import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombres: varchar("nombres", { length: 255 }).notNull(),
  apellidos: varchar("apellidos", { length: 255 }),
  documentoIdentidad: varchar("documento_identidad", { length: 50 })
    .notNull()
    .unique(),
  ruc: varchar("ruc", { length: 11 }),
  tipoPersona: varchar("tipo_persona", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  telefono: varchar("telefono", { length: 30 }),
  codigoPais: varchar("codigo_pais", { length: 10 }).notNull().default("51"),
  codigoDepartamento: varchar("codigo_departamento", { length: 50 }),
  domicilio: varchar("domicilio", { length: 500 }),
  nacionalidad: varchar("nacionalidad", { length: 50 }),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;