import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";

export type IncidentSeveridad = "LEVE" | "MEDIA" | "GRAVE";
export type IncidentTipo = "CONVIVENCIA" | "PAGO" | "DANOS" | "OTRO";

/**
 * Incidencia registrada manualmente sobre un inquilino/cliente.
 * Las incidencias de convivencia (ruidos, conflictos con vecinos, etc.)
 * reducen el puntaje de scoring del cliente.
 */
export const tenantIncidents = pgTable(
  "tenant_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clients.id),
    /** Tipo de incidencia: convivencia, daños, pago u otro. */
    tipo: varchar("tipo", { length: 30 }).notNull().default("CONVIVENCIA"),
    /** Severidad que determina la penalización en el scoring. */
    severidad: varchar("severidad", { length: 20 }).notNull().default("MEDIA"),
    /** Descripción libre: qué ocurrió, con qué vecino, etc. */
    descripcion: text("descripcion").notNull().default(""),
    /** Departamento (código) donde ocurrió, si aplica. */
    departamentoCodigo: varchar("departamento_codigo", { length: 50 }),
    creadoPor: varchar("creado_por", { length: 255 }),
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tenant_incidents_cliente_idx").on(table.clienteId),
    index("tenant_incidents_tipo_idx").on(table.tipo),
  ],
);

export type TenantIncidentRow = typeof tenantIncidents.$inferSelect;
export type NewTenantIncidentRow = typeof tenantIncidents.$inferInsert;
