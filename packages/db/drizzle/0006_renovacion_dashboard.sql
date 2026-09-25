ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "renueva_proximo_mes" boolean;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "renovacion_meses" integer;