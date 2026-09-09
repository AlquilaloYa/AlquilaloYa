import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { departments } from "./departments";

/**
 * Plantilla de contrato (Fase 3).
 * Una plantilla tiene múltiples versiones; una versión publicada no se edita.
 */
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: varchar("clave", { length: 30 }).notNull().unique(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contenido: text("contenido"),
    pdfStorageKey: text("pdf_storage_key"),
    pdfFilename: text("pdf_filename"),
    publicada: boolean("publicada").notNull().default(false),
    publicadoEn: timestamp("publicado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("template_versions_template_id_version_unique").on(
      table.templateId,
      table.version
    ),
    index("template_versions_template_idx").on(table.templateId),
  ]
);

/** Asociación de una plantilla a departamentos donde está disponible. */
export const templateDepartments = pgTable(
  "template_departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    departamentoId: uuid("departamento_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("template_departments_template_departamento_unique").on(
      table.templateId,
      table.departamentoId
    ),
  ]
);

export type TemplateRow = typeof templates.$inferSelect;
export type NewTemplateRow = typeof templates.$inferInsert;
export type TemplateVersionRow = typeof templateVersions.$inferSelect;
export type NewTemplateVersionRow = typeof templateVersions.$inferInsert;
export type TemplateDepartmentRow = typeof templateDepartments.$inferSelect;
export type NewTemplateDepartmentRow = typeof templateDepartments.$inferInsert;