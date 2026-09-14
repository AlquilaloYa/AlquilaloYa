import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contacts } from "./ops";

/** Lead del pipeline multicanal (WhatsApp / Messenger / TikTok / Web / Manual). */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 150 }).notNull(),
    apellido: varchar("apellido", { length: 150 }).notNull().default(""),
    contactoId: uuid("contacto_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    canal: varchar("canal", { length: 30 }).notNull().default("MANUAL"),
    etapa: varchar("etapa", { length: 30 }).notNull().default("ENTRANTE"),
    servicio: varchar("servicio", { length: 255 }).notNull().default(""),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    tags: jsonb("tags").notNull().default([]),
    asignadoA: varchar("asignado_a", { length: 255 }).notNull().default(""),
    venceEl: date("vence_el"),
    notas: text("notas").notNull().default(""),
    origenExternoId: varchar("origen_externo_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("leads_canal_origen_externo_unique").on(table.canal, table.origenExternoId),
    index("leads_etapa_idx").on(table.etapa),
    index("leads_canal_idx").on(table.canal),
    index("leads_asignado_idx").on(table.asignadoA),
  ]
);

export type LeadRow = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;
