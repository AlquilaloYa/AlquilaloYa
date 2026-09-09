ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "mascotas_items" jsonb NOT NULL DEFAULT '[]'::jsonb;
