-- §6 Información personal / laboral del expediente.
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "fecha_nacimiento" timestamp with time zone;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "nacionalidad" varchar(80) NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "codigo_empleado" varchar(40) NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "fecha_baja" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "hr_employees_codigo_idx" ON "hr_employees" ("codigo_empleado");

-- §7 Cargos: descripción, nivel, supervisor y permisos base.
ALTER TABLE "hr_positions" ADD COLUMN IF NOT EXISTS "descripcion" text NOT NULL DEFAULT '';
ALTER TABLE "hr_positions" ADD COLUMN IF NOT EXISTS "nivel" integer;
ALTER TABLE "hr_positions" ADD COLUMN IF NOT EXISTS "supervisor_id" uuid REFERENCES "hr_positions"("id");
ALTER TABLE "hr_positions" ADD COLUMN IF NOT EXISTS "permisos_base" jsonb NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "hr_positions_supervisor_idx" ON "hr_positions" ("supervisor_id");

-- §10 Historial: motivo explícito de cada cambio.
ALTER TABLE "hr_employee_history" ADD COLUMN IF NOT EXISTS "motivo" text NOT NULL DEFAULT '';

-- §13 Onboarding. Cada paso se materializa además en la tabla transversal "tasks".
CREATE TABLE IF NOT EXISTS "hr_onboarding_processes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "hr_employees"("id"),
  "etapa" varchar(40) NOT NULL DEFAULT 'REGISTRO',
  "estado" varchar(30) NOT NULL DEFAULT 'EN_CURSO',
  "fecha_inicio" timestamp with time zone NOT NULL DEFAULT now(),
  "fecha_fin" timestamp with time zone,
  "creado_por" varchar(255) NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_onboarding_processes_employee_idx" ON "hr_onboarding_processes" ("employee_id");
CREATE INDEX IF NOT EXISTS "hr_onboarding_processes_estado_idx" ON "hr_onboarding_processes" ("estado");
CREATE UNIQUE INDEX IF NOT EXISTS "hr_onboarding_one_open_key" ON "hr_onboarding_processes" ("employee_id", "estado");

CREATE TABLE IF NOT EXISTS "hr_onboarding_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "process_id" uuid NOT NULL REFERENCES "hr_onboarding_processes"("id"),
  "clave" varchar(60) NOT NULL,
  "titulo" varchar(255) NOT NULL,
  "descripcion" text NOT NULL DEFAULT '',
  "orden" integer NOT NULL DEFAULT 0,
  "estado" varchar(30) NOT NULL DEFAULT 'PENDIENTE',
  "task_id" uuid REFERENCES "tasks"("id"),
  "responsable" varchar(255) NOT NULL DEFAULT '',
  "fecha_limite" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_onboarding_tasks_process_idx" ON "hr_onboarding_tasks" ("process_id", "orden");
CREATE INDEX IF NOT EXISTS "hr_onboarding_tasks_task_idx" ON "hr_onboarding_tasks" ("task_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hr_onboarding_task_key" ON "hr_onboarding_tasks" ("process_id", "clave");
