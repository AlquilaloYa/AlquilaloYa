import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Capa de integraciones (Fase 6).
 * - connector_instances: instancias de conectores configurados.
 * - connector_credentials: credenciales cifradas (nunca tokens en texto plano).
 * - connector_logs: log de despachos/cambios para actividad, reintentos y DLQ.
 */

export const connector_instances = pgTable(
  "connector_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 30 }).notNull().default("ENABLED"),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").notNull(),
    // Puntero denormalizado a la credencial activa (sincronizado por el repo).
    credentialId: uuid("credential_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_instances_type_idx").on(table.type),
    index("connector_instances_provider_idx").on(table.provider),
  ]
);

export const connector_credentials = pgTable(
  "connector_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connector_instances.id, { onDelete: "cascade" }),
    authType: varchar("auth_type", { length: 30 }).notNull(),
    /** Payload cifrado (AES-GCM) con el secreto de la app. */
    encrypted: text("encrypted").notNull(),
    /** Hash del secreto para verificar sin revertir el cifrado. */
    fingerprint: varchar("fingerprint", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_credentials_connector_idx").on(table.connectorId),
  ]
);

export const connector_logs = pgTable(
  "connector_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    ok: boolean("ok").notNull().default(true),
    statusCode: integer("status_code"),
    payload: jsonb("payload"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_logs_connector_idx").on(table.connectorId),
    index("connector_logs_created_idx").on(table.createdAt),
  ]
);

export type ConnectorInstanceRow = typeof connector_instances.$inferSelect;
export type NewConnectorInstanceRow = typeof connector_instances.$inferInsert;
export type ConnectorCredentialRow = typeof connector_credentials.$inferSelect;
export type NewConnectorCredentialRow = typeof connector_credentials.$inferInsert;
export type ConnectorLogRow = typeof connector_logs.$inferSelect;
export type NewConnectorLogRow = typeof connector_logs.$inferInsert;