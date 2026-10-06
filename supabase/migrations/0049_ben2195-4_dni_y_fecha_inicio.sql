-- Contrato BEN2195-4 (Araseli Teresa Carmona Martínez):
--   1) DNI correcto 48221931 (antes 76373620): clients + los 3 snapshots
--      (contrato, ADD-1 y ADD-2), donde vive datos_cliente.documentoIdentidad.
--   2) Fecha de inicio 28/11/2025 (antes 28/10/2025): contracts + los 3 snapshots.
-- Idempotente: solo escribe si el valor anterior sigue siendo el esperado.
-- El PDF se regenera desde el snapshot con ?regenerate=1 (accion ADMIN).

UPDATE "clients"
SET "documento_identidad" = '48221931', "updated_at" = now()
WHERE "id" = 'a6b1e116-6af7-4e9d-bc08-065f54f9740c'
  AND "documento_identidad" = '76373620';

UPDATE "contract_snapshots"
SET "datos_cliente" = jsonb_set("datos_cliente", '{documentoIdentidad}', '"48221931"')
WHERE "codigo_contrato" LIKE 'BEN2195-4%'
  AND "datos_cliente" ->> 'documentoIdentidad' = '76373620';

UPDATE "contracts"
SET "fecha_inicio" = '2025-11-28', "actualizado_en" = now()
WHERE "id" = '791de558-63e0-41af-b62b-cd8abfc6735f'
  AND "fecha_inicio" = '2025-10-28';

UPDATE "contract_snapshots"
SET "datos_contrato" = jsonb_set("datos_contrato", '{fechaInicio}', '"2025-11-28"')
WHERE "codigo_contrato" LIKE 'BEN2195-4%'
  AND "datos_contrato" ->> 'fechaInicio' = '2025-10-28';
