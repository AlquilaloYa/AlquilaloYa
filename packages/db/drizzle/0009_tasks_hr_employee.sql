ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "empleado_id" uuid REFERENCES "hr_employees"("id");
CREATE INDEX IF NOT EXISTS "tasks_empleado_idx" ON "tasks" ("empleado_id");