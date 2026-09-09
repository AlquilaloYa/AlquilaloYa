ALTER TABLE "departments"
  ADD COLUMN IF NOT EXISTS "garantia" numeric(15,2) NOT NULL DEFAULT 0;

UPDATE "departments"
SET "garantia" = "precio"
WHERE "garantia" = 0 AND "precio" > 0;
