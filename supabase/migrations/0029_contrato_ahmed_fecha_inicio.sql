-- Contrato BEN2195-19 (Ahmed Mohamed Ahmed Moghazi): inicia el 3/09/2026 (antes 3/06/2026).
-- Corrige tabla contracts y el snapshot (datos_contrato.fechaInicio) para que el PDF regenere fechas correctas.
UPDATE "contracts"
SET "fecha_inicio" = '2026-09-03', "actualizado_en" = now()
WHERE "id" = '241df755-8027-4ec8-8960-0647711a5f0d';

UPDATE "contract_snapshots"
SET "datos_contrato" = jsonb_set("datos_contrato", '{fechaInicio}', '"2026-09-03"')
WHERE "id" = '95d0cf84-5ce3-43f1-9f01-f0dcb9747f1a';