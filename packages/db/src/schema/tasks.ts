import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Tarea de trabajo interno asignada a una persona con fecha limite de resolucion. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descripcion: text("descripcion").notNull().default(""),
    asignadoA: varchar("asignado_a", { length: 255 }).notNull().default(""),
    fechaLimite: timestamp("fecha_limite", { withTimezone: true }).notNull(),
    estado: varchar("estado", { length: 30 }).notNull().default("PENDIENTE"),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    origenTipo: varchar("origen_tipo", { length: 30 }).notNull().default("MANUAL"),
    origenContratoId: uuid("origen_contrato_id"),
    origenEvento: varchar("origen_evento", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_estado_idx").on(table.estado),
    index("tasks_fecha_limite_idx").on(table.fechaLimite),
    index("tasks_asignado_idx").on(table.asignadoA),
    index("tasks_origen_contrato_idx").on(table.origenContratoId, table.origenEvento),
  ]
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;