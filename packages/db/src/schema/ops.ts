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

/** Preguntas del banco usado por las inspecciones (checklist). */
export const inspectionQuestions = pgTable(
  "inspection_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    texto: text("texto").notNull(),
    orden: integer("orden").notNull().default(0),
    activa: boolean("activa").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("inspection_questions_orden_idx").on(table.orden)]
);

/** Inspección (checklist ✓/✗) sobre un contacto/departamento. */
export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactoId: uuid("contacto_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    contactoNombre: varchar("contacto_nombre", { length: 511 }).notNull().default(""),
    nombre: varchar("nombre", { length: 255 }).notNull().default(""),
    numero: varchar("numero", { length: 20 }).notNull().default(""),
    personaInspecciona: varchar("persona_inspecciona", { length: 255 }).notNull().default(""),
    inspectorId: varchar("inspector_id", { length: 255 }).notNull().default(""),
    inspectorNombre: varchar("inspector_nombre", { length: 255 }).notNull().default(""),
    departamentoId: uuid("departamento_id"),
    departamentoNombre: varchar("departamento_nombre", { length: 255 }).notNull().default(""),
    asignadoA: varchar("asignado_a", { length: 255 }).notNull().default(""),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
    estado: varchar("estado", { length: 30 }).notNull().default("BORRADOR"),
    items: jsonb("items").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("inspections_estado_idx").on(table.estado),
    index("inspections_fecha_idx").on(table.fecha),
    index("inspections_contacto_idx").on(table.contactoId),
  ]
);

export type InspectionQuestionRow = typeof inspectionQuestions.$inferSelect;
export type InspectionRow = typeof inspections.$inferSelect;

/** Plantilla reutilizable de checklist: nombre + preguntas agrupadas por categoria. */
export const inspectionTemplates = pgTable("inspection_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  categorias: jsonb("categorias").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InspectionTemplateRow = typeof inspectionTemplates.$inferSelect;
