import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: varchar("codigo", { length: 50 }).notNull().unique(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    numero: varchar("numero", { length: 10 }).notNull(),
    tipo: varchar("tipo", { length: 50 }).notNull().default("Departamento"),
    personaPago: varchar("persona_pago", { length: 255 }).notNull(),
    piso: integer("piso").notNull().default(1),
    precio: numeric("precio", { precision: 15, scale: 2 }).notNull().default("0"),
    garantia: numeric("garantia", { precision: 15, scale: 2 }).notNull().default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 }).notNull().default("50"),
    servicios: varchar("servicios", { length: 255 }).notNull().default("Agua, luz"),
    activo: boolean("activo").notNull().default(true),
    estadoManual: varchar("estado_manual", { length: 20 }),
    estadoManualUpdatedAt: timestamp("estado_manual_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("departments_codigo_idx").on(table.codigo),
    index("departments_persona_pago_idx").on(table.personaPago),
    index("departments_piso_idx").on(table.piso),
  ]
);

export type DepartmentRow = typeof departments.$inferSelect;
export type NewDepartmentRow = typeof departments.$inferInsert;
