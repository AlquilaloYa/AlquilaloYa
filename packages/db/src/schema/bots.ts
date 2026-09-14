import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { messageTemplates } from "./messaging";

/** Regla de bot: si un mensaje entrante hace match, responde con la plantilla. */
export const botRules = pgTable(
  "bot_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 150 }).notNull().unique(),
    canal: varchar("canal", { length: 30 }).notNull().default("WHATSAPP"),
    keywords: jsonb("keywords").notNull().default([]),
    plantillaId: uuid("plantilla_id").references(() => messageTemplates.id, {
      onDelete: "set null",
    }),
    cuerpo: text("cuerpo").notNull().default(""),
    unaPorConversacion: boolean("una_por_conversacion").notNull().default(true),
    activa: boolean("activa").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bot_rules_canal_idx").on(table.canal, table.activa)]
);

export type BotRuleRow = typeof botRules.$inferSelect;
export type NewBotRuleRow = typeof botRules.$inferInsert;
