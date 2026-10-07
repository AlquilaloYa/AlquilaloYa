import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Cronograma de asistencia: una fila por jornada del trabajador.
 * Los horarios los estampa el servidor en el momento en que se pulsa
 * cada boton (entrada, refrigerio y salida).
 */
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    dni: varchar("dni", { length: 30 }).notNull(),
    entradaAt: timestamp("entrada_at", { withTimezone: true }),
    refrigerioInicioAt: timestamp("refrigerio_inicio_at", { withTimezone: true }),
    refrigerioFinAt: timestamp("refrigerio_fin_at", { withTimezone: true }),
    salidaAt: timestamp("salida_at", { withTimezone: true }),
    /** Se marca automaticamente al registrar la entrada. */
    asistio: boolean("asistio").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attendance_dni_idx").on(table.dni),
    index("attendance_created_idx").on(table.createdAt),
  ],
);

export type AttendanceRow = typeof attendance.$inferSelect;
