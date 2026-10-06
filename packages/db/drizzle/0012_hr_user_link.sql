ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id");
CREATE UNIQUE INDEX IF NOT EXISTS "hr_employees_user_id_key" ON "hr_employees" ("user_id");