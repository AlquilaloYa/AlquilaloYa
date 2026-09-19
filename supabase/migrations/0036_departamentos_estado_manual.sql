-- Estado manual de departamentos: MANTENIMIENTO o BLOQUEADO (NULL = automático)
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "estado_manual" varchar(20);
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "estado_manual_updated_at" timestamptz;

-- Angamos: 8C y 8 en mantenimiento; 7C, 4 y 5 bloqueados
UPDATE "departments"
SET "estado_manual" = 'MANTENIMIENTO', "estado_manual_updated_at" = now(), "updated_at" = now()
WHERE "codigo" IN ('ANG170-8C', 'ANG170-8');

UPDATE "departments"
SET "estado_manual" = 'BLOQUEADO', "estado_manual_updated_at" = now(), "updated_at" = now()
WHERE "codigo" IN ('ANG170-7C', 'ANG170-4', 'ANG170-5');