-- BEN2195-7: el arriendo es S/ 1650 mas S/ 50 de mantenimiento.
--
-- La migracion 0035 subio el departamento a 1650 pero dejo el contrato, sus
-- pagos, el monto de separacion y el snapshot congelado del PDF en 1600, que
-- es de donde se habian copiado al crear el contrato. En 38 de los 39
-- contratos del sistema el canon coincide con el precio del departamento, y
-- el monto de cada pago coincide con el canon, asi que aqui tambien debe ser
-- 1650.
--
-- El mantenimiento (S/ 50) se cobra aparte y no se toca en ningun sitio.

UPDATE "departments"
SET "precio" = 1650, "garantia" = 1650, "updated_at" = now()
WHERE "codigo" = 'BEN2195-7';

UPDATE "contracts"
SET "monto_canon_mensual" = 1650,
    "deposito_garantia" = 1650,
    "separacion_detalle" = jsonb_set(
      "separacion_detalle",
      '{monto}',
      to_jsonb('1650.00'::text)
    ),
    "actualizado_en" = now()
WHERE "codigo_contrato" = 'BEN2195-7'
  AND "monto_canon_mensual" = 1600;

UPDATE "payments"
SET "monto" = 1650, "updated_at" = now()
WHERE "contract_id" = (SELECT id FROM contracts WHERE codigo_contrato = 'BEN2195-7')
  AND "monto" = 1600;

UPDATE "separations"
SET "monto_separacion" = 1650, "updated_at" = now()
WHERE "departamento_id" = (SELECT id FROM departments WHERE codigo = 'BEN2195-7')
  AND "monto_separacion" = 1600;

UPDATE "contract_snapshots"
SET "datos_departamento" = jsonb_set(
      "datos_departamento",
      '{precio}',
      to_jsonb('1650.00'::text)
    ),
    "datos_contrato" = jsonb_set(
      jsonb_set(
        jsonb_set(
          "datos_contrato",
          '{montoCanonMensual}',
          to_jsonb('1650.00'::text)
        ),
        '{depositoGarantia}',
        to_jsonb('1650.00'::text)
      ),
      '{separacionDetalle,monto}',
      to_jsonb('1650.00'::text)
    )
WHERE "id" = (SELECT snapshot_id FROM contracts WHERE codigo_contrato = 'BEN2195-7')
  AND "datos_contrato"->>'montoCanonMensual' = '1600.00';
