import {
  boolean,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Expediente de una persona; no representa credenciales de acceso. */
export const hrEmployees = pgTable(
  "hr_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombres: varchar("nombres", { length: 255 }).notNull(),
    apellidos: varchar("apellidos", { length: 255 }).notNull().default(""),
    dni: varchar("dni", { length: 30 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    telefono: varchar("telefono", { length: 40 }).notNull().default(""),
    cargo: varchar("cargo", { length: 255 }).notNull().default(""),
    area: varchar("area", { length: 120 }).notNull().default(""),
    sede: varchar("sede", { length: 160 }).notNull().default(""),
    equipo: varchar("equipo", { length: 160 }).notNull().default(""),
    responsable: varchar("responsable", { length: 255 }).notNull().default(""),
    organizationId: uuid("organization_id").references(() => hrOrganizations.id),
    siteId: uuid("site_id").references(() => hrSites.id),
    departmentId: uuid("department_id").references(() => hrDepartments.id),
    teamId: uuid("team_id").references(() => hrTeams.id),
    positionId: uuid("position_id").references(() => hrPositions.id),
    // La auto-referencia necesita el tipo explícito: sin él la inferencia de
    // `hrEmployees` queda en bucle y todo el módulo se vuelve `any`.
    managerId: uuid("manager_id").references((): AnyPgColumn => hrEmployees.id),
    fechaIngreso: timestamp("fecha_ingreso", { withTimezone: true }),
    // §6 Información personal / laboral
    fechaNacimiento: timestamp("fecha_nacimiento", { withTimezone: true }),
    nacionalidad: varchar("nacionalidad", { length: 80 }).notNull().default(""),
    codigoEmpleado: varchar("codigo_empleado", { length: 40 }).notNull().default(""),
    fechaBaja: timestamp("fecha_baja", { withTimezone: true }),
    estado: varchar("estado", { length: 30 }).notNull().default("ACTIVO"),
    direccion: text("direccion").notNull().default(""),
    notas: text("notas").notNull().default(""),
    documentos: jsonb("documentos").notNull().default([]),
    onboardingStage: varchar("onboarding_stage", { length: 40 }).notNull().default("REGISTRO"),
    userId: uuid("user_id").references(() => users.id),
    creadoPor: varchar("creado_por", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("hr_employees_dni_idx").on(table.dni),
    index("hr_employees_codigo_idx").on(table.codigoEmpleado),
    index("hr_employees_estado_idx").on(table.estado),
    index("hr_employees_deleted_at_idx").on(table.deletedAt),
    index("hr_employees_department_idx").on(table.departmentId),
    index("hr_employees_team_idx").on(table.teamId),
    index("hr_employees_manager_idx").on(table.managerId),
    unique("hr_employees_user_id_key").on(table.userId),
  ]
);

export const hrOrganizations = pgTable("hr_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 255 }).notNull().unique(),
  ruc: varchar("ruc", { length: 20 }).notNull().default(""),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hrSites = pgTable("hr_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => hrOrganizations.id),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  direccion: text("direccion").notNull().default(""),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_sites_organization_idx").on(table.organizationId),
  unique("hr_sites_org_name_key").on(table.organizationId, table.nombre),
]);

export const hrDepartments = pgTable("hr_departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => hrOrganizations.id),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_departments_organization_idx").on(table.organizationId),
  unique("hr_departments_org_name_key").on(table.organizationId, table.nombre),
]);

export const hrTeams = pgTable("hr_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").notNull().references(() => hrDepartments.id),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_teams_department_idx").on(table.departmentId),
  unique("hr_teams_department_name_key").on(table.departmentId, table.nombre),
]);

export const hrPositions = pgTable("hr_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => hrOrganizations.id),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  // §7 Cargos: descripción, nivel, supervisor y permisos base.
  descripcion: text("descripcion").notNull().default(""),
  nivel: integer("nivel"),
  supervisorId: uuid("supervisor_id").references((): AnyPgColumn => hrPositions.id),
  permisosBase: jsonb("permisos_base").notNull().default([]),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_positions_organization_idx").on(table.organizationId),
  index("hr_positions_supervisor_idx").on(table.supervisorId),
  unique("hr_positions_org_name_key").on(table.organizationId, table.nombre),
]);

/** Cada relación laboral tiene su propio ciclo y puede renovarse sin reescribir historia. */
export const hrEmployments = pgTable("hr_employments", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => hrEmployees.id),
  tipoContrato: varchar("tipo_contrato", { length: 80 }).notNull().default("INDEFINIDO"),
  numeroContrato: varchar("numero_contrato", { length: 120 }).notNull().default(""),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull(),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }),
  estado: varchar("estado", { length: 30 }).notNull().default("ACTIVO"),
  salario: varchar("salario", { length: 40 }).notNull().default(""),
  renovacionDeId: uuid("renovacion_de_id"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_employments_employee_start_idx").on(table.employeeId, table.fechaInicio),
  index("hr_employments_end_idx").on(table.fechaFin),
]);

/** Metadatos versionados; los bytes viven en el bucket privado hr-documents. */
export const hrEmployeeDocuments = pgTable("hr_employee_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => hrEmployees.id),
  employmentId: uuid("employment_id").references(() => hrEmployments.id),
  tipo: varchar("tipo", { length: 60 }).notNull(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  version: integer("version").notNull().default(1),
  storageKey: text("storage_key").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  estado: varchar("estado", { length: 30 }).notNull().default("VIGENTE"),
  fechaDocumento: timestamp("fecha_documento", { withTimezone: true }),
  venceEn: timestamp("vence_en", { withTimezone: true }),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_employee_documents_employee_idx").on(table.employeeId, table.createdAt),
  index("hr_employee_documents_expiry_idx").on(table.venceEn),
]);

export const hrRequests = pgTable("hr_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => hrEmployees.id),
  tipo: varchar("tipo", { length: 30 }).notNull(),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull(),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }).notNull(),
  motivo: text("motivo").notNull(),
  estado: varchar("estado", { length: 30 }).notNull().default("PENDIENTE"),
  aprobadoPor: varchar("aprobado_por", { length: 255 }),
  respondidoEn: timestamp("respondido_en", { withTimezone: true }),
  respuesta: text("respuesta").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hr_requests_employee_idx").on(table.employeeId, table.createdAt),
  index("hr_requests_status_idx").on(table.estado, table.tipo),
]);

/** Auditoría de expediente. Los snapshots guardan campos HR, no secretos de auth. */
export const hrEmployeeHistory = pgTable(
  "hr_employee_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => hrEmployees.id),
    actor: varchar("actor", { length: 255 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    // §10: cada cambio guarda el motivo explícito, además del diff.
    motivo: text("motivo").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("hr_employee_history_employee_created_idx").on(table.employeeId, table.createdAt),
  ]
);

export type HrEmployeeRow = typeof hrEmployees.$inferSelect;
export type NewHrEmployeeRow = typeof hrEmployees.$inferInsert;
export type HrEmployeeHistoryRow = typeof hrEmployeeHistory.$inferSelect;