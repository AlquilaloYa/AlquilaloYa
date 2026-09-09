import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const activity_events = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
  userId: uuid("user_id"),
  actorType: varchar("actor_type", { length: 30 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  result: varchar("result", { length: 30 }).notNull().default("SUCCESS"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("activity_events_entity_timestamp_idx").on(table.entityId, table.timestamp),
  index("activity_events_user_timestamp_idx").on(table.userId, table.timestamp),
  index("activity_events_action_timestamp_idx").on(table.action, table.timestamp),
]);

export const audit_events = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuario: varchar("usuario", { length: 255 }).notNull(),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  accion: varchar("accion", { length: 100 }).notNull(),
  entidad: varchar("entidad", { length: 50 }).notNull(),
  estadoAnterior: jsonb("estado_anterior"),
  estadoNuevo: jsonb("estado_nuevo"),
  resultado: varchar("resultado", { length: 30 }).notNull().default("SUCCESS"),
  metadataSegura: jsonb("metadata_segura"),
}, (table) => [
  index("audit_events_accion_fecha_idx").on(table.accion, table.fecha),
  index("audit_events_usuario_fecha_idx").on(table.usuario, table.fecha),
]);

export type ActivityEventRow = typeof activity_events.$inferSelect;
export type NewActivityEventRow = typeof activity_events.$inferInsert;
export type AuditEventRow = typeof audit_events.$inferSelect;
export type NewAuditEventRow = typeof audit_events.$inferInsert;