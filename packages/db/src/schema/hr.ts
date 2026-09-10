import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Expediente de un colaborador (Recursos Humanos). */
export const hrEmployees = pgTable(
  "hr_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombres: varchar("nombres", { length: 255 }).notNull(),
    apellidos: varchar("apellidos", { length: 255 }).notNull().default(""),
    dni: varchar("dni", { length: 30 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    telefono: varchar("telefono", { length: 40 }).notNull().default(""),
    cargo: varchar("cargo", { length: 255 }).notNull().default(""),
    area: varchar("area", { length: 120 }).notNull().default(""),
    fechaIngreso: timestamp("fecha_ingreso", { withTimezone: true }),
    estado: varchar("estado", { length: 30 }).notNull().default("ACTIVO"),
    direccion: text("direccion").notNull().default(""),
    notas: text("notas").notNull().default(""),
    documentos: jsonb("documentos").notNull().default([]),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hr_employees_dni_idx").on(table.dni),
    index("hr_employees_estado_idx").on(table.estado),
  ]
);

export type HrEmployeeRow = typeof hrEmployees.$inferSelect;
export type NewHrEmployeeRow = typeof hrEmployees.$inferInsert;