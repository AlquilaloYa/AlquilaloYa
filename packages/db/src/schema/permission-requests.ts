import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Solicitudes de permiso: los roles de solo lectura (RRHH, asistente
 * administrativo) piden autorización para modificar algo. La ven y la
 * resuelven el Developer y los Administradores.
 */
export const permissionRequests = pgTable("permission_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userName: varchar("user_name", { length: 255 }).notNull(),
  userRole: varchar("user_role", { length: 40 }).notNull(),
  modulo: varchar("modulo", { length: 120 }).notNull(),
  detalle: text("detalle").notNull(),
  estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
  comentario: text("comentario"),
  resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type PermissionRequestRow = typeof permissionRequests.$inferSelect;
export type NewPermissionRequestRow = typeof permissionRequests.$inferInsert;