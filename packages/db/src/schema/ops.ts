import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { departments } from "./departments";

/** Contacto del equipo (antes lived solo en localStorage del navegador). */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    apellido: varchar("apellido", { length: 255 }).notNull().default(""),
    tipoPersona: varchar("tipo_persona", { length: 20 }).notNull().default("NATURAL"),
    dni: varchar("dni", { length: 30 }).notNull().default(""),
    ruc: varchar("ruc", { length: 20 }),
    email: varchar("email", { length: 255 }).notNull().default(""),
    telefono: varchar("telefono", { length: 40 }),
    domicilio: text("domicilio"),
    contactoEmergencia: jsonb("contacto_emergencia"),
    mascotas: boolean("mascotas").notNull().default(false),
    mascotasItems: jsonb("mascotas_items").notNull().default([]),
    copiaDni: jsonb("copia_dni").notNull().default([]),
    copiaBoletas: jsonb("copia_boletas").notNull().default([]),
    copiaAntecedentes: jsonb("copia_antecedentes").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_dni_idx").on(table.dni),
    index("contacts_email_idx").on(table.email),
  ]
);

/** Separación de un departamento (una activa por departamento). */
export const separations = pgTable(
  "separations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departamentoId: uuid("departamento_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    contactoId: uuid("contacto_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    montoSeparacion: numeric("monto_separacion", { precision: 12, scale: 2 })
      .notNull()
      .default("500"),
    tipoSeparacion: varchar("tipo_separacion", { length: 20 }).notNull().default("500"),
    garantiaExtendida: boolean("garantia_extendida").notNull().default(false),
    baucherGarantiaExtendida: text("baucher_garantia_extendida"),
    fechaGarantiaExtendida: timestamp("fecha_garantia_extendida", { withTimezone: true }),
    fechaSeparacion: timestamp("fecha_separacion", { withTimezone: true }).notNull().defaultNow(),
    diasTiempo: integer("dias_tiempo"),
    fechaLimiteManual: timestamp("fecha_limite_manual", { withTimezone: true }),
    baucherSeparacion: text("baucher_separacion"),
    estado: varchar("estado", { length: 30 }).notNull().default("SEPARADO"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("separations_departamento_unique").on(table.departamentoId),
    index("separations_contacto_idx").on(table.contactoId),
  ]
);

/** Inventario (bienes propios) de cada departamento. */
export const departmentInventories = pgTable(
  "department_inventories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departamentoId: uuid("departamento_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    items: jsonb("items").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("department_inventories_departamento_unique").on(table.departamentoId)]
);

export type ContactRow = typeof contacts.$inferSelect;
export type SeparationRow = typeof separations.$inferSelect;
export type DepartmentInventoryRow = typeof departmentInventories.$inferSelect;
