ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "sede" varchar(160) NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "equipo" varchar(160) NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "responsable" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
UPDATE "hr_employees" SET "estado" = 'PERMISO' WHERE "estado" = 'LICENCIA';
CREATE INDEX IF NOT EXISTS "hr_employees_deleted_at_idx" ON "hr_employees" ("deleted_at");

CREATE TABLE IF NOT EXISTS "hr_employee_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "hr_employees"("id"),
  "actor" varchar(255) NOT NULL,
  "action" varchar(40) NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_employee_history_employee_created_idx"
  ON "hr_employee_history" ("employee_id", "created_at");