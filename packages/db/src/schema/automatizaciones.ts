import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Regla de automatización: evento + parámetros → acciones determinísticas. */
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 150 }).notNull().unique(),
  evento: varchar("evento", { length: 40 }).notNull(),
  params: jsonb("params").notNull().default({}),
  acciones: jsonb("acciones").notNull().default([]),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Ejecución de una regla (historial/observabilidad). */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").references(() => automationRules.id, { onDelete: "cascade" }),
    fuente: varchar("fuente", { length: 10 }).notNull().default("MANUAL"),
    detalle: jsonb("detalle").notNull().default({}),
    ejecutadoEn: timestamp("ejecutado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("automation_runs_rule_idx").on(table.ruleId, table.ejecutadoEn)]
);

export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type AutomationRunRow = typeof automationRuns.$inferSelect;
