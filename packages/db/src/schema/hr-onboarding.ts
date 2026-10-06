import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { hrEmployees } from "./hr";
import { tasks } from "./tasks";

/**
 * §13 Onboarding. RRHH no tiene motor de tareas propio: cada paso genera una
 * fila en `tasks` (§14) y aquí sólo se guarda el vínculo con el proceso.
 */
export const hrOnboardingProcesses = pgTable(
  "hr_onboarding_processes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => hrEmployees.id),
    etapa: varchar("etapa", { length: 40 }).notNull().default("REGISTRO"),
    estado: varchar("estado", { length: 30 }).notNull().default("EN_CURSO"),
    fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull().defaultNow(),
    fechaFin: timestamp("fecha_fin", { withTimezone: true }),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hr_onboarding_processes_employee_idx").on(table.employeeId),
    index("hr_onboarding_processes_estado_idx").on(table.estado),
    // Sólo puede haber un proceso abierto por trabajador.
    unique("hr_onboarding_one_open_key").on(table.employeeId, table.estado),
  ]
);

export const hrOnboardingTasks = pgTable(
  "hr_onboarding_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    processId: uuid("process_id")
      .notNull()
      .references(() => hrOnboardingProcesses.id),
    clave: varchar("clave", { length: 60 }).notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descripcion: text("descripcion").notNull().default(""),
    orden: integer("orden").notNull().default(0),
    estado: varchar("estado", { length: 30 }).notNull().default("PENDIENTE"),
    // Vínculo con el motor transversal de tareas del ERP.
    taskId: uuid("task_id").references(() => tasks.id),
    responsable: varchar("responsable", { length: 255 }).notNull().default(""),
    fechaLimite: timestamp("fecha_limite", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hr_onboarding_tasks_process_idx").on(table.processId, table.orden),
    index("hr_onboarding_tasks_task_idx").on(table.taskId),
    unique("hr_onboarding_task_key").on(table.processId, table.clave),
  ]
);

export type HrOnboardingProcessRow = typeof hrOnboardingProcesses.$inferSelect;
export type NewHrOnboardingProcessRow = typeof hrOnboardingProcesses.$inferInsert;
export type HrOnboardingTaskRow = typeof hrOnboardingTasks.$inferSelect;
export type NewHrOnboardingTaskRow = typeof hrOnboardingTasks.$inferInsert;
