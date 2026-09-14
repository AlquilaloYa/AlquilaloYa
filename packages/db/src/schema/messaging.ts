import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { leads } from "./leads";

/** Conversación multicanal de la bandeja (Fase 0 mensajería). */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canal: varchar("canal", { length: 30 }).notNull().default("MANUAL"),
    externoId: varchar("externo_id", { length: 255 }),
    contactoNombre: varchar("contacto_nombre", { length: 255 }).notNull().default(""),
    contactoTelefono: varchar("contacto_telefono", { length: 50 }).notNull().default(""),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    estado: varchar("estado", { length: 20 }).notNull().default("ABIERTA"),
    asignadoA: varchar("asignado_a", { length: 255 }).notNull().default(""),
    ultimoMensaje: text("ultimo_mensaje").notNull().default(""),
    ultimoMensajeEn: timestamp("ultimo_mensaje_en", { withTimezone: true }),
    noLeidos: integer("no_leidos").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_canal_externo_unique")
      .on(table.canal, table.externoId),
    index("conversations_estado_idx").on(table.estado),
    index("conversations_asignado_idx").on(table.asignadoA),
  ]
);

/** Mensajes normalizados (CanonicalMessage simplificado) de una conversación. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direccion: varchar("direccion", { length: 10 }).notNull().default("INBOUND"),
    autor: varchar("autor", { length: 255 }).notNull().default(""),
    contenido: text("contenido").notNull().default(""),
    externoMsgId: varchar("externo_msg_id", { length: 255 }),
    estado: varchar("estado", { length: 20 }).notNull().default("ENVIADO"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId, table.createdAt),
    uniqueIndex("messages_externo_unique").on(table.conversationId, table.externoMsgId),
  ]
);

/** Plantillas de mensajes rápidos/automáticos. */
export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 150 }).notNull().unique(),
  canal: varchar("canal", { length: 30 }).notNull().default("TODOS"),
  cuerpo: text("cuerpo").notNull(),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type MessageTemplateRow = typeof messageTemplates.$inferSelect;
export type NewMessageTemplateRow = typeof messageTemplates.$inferInsert;
