-- BEN2195-7 (adenda): el arriendo de la adenda tambien es S/ 1650 mas S/ 50 de
-- mantenimiento.
--
-- La migracion 0040 corrigio el contrato base, sus pagos, el monto de
-- separacion, el departamento y el snapshot congelado del contrato, pero no
-- toco el snapshot de la adenda (BEN2195-7-ADD-1). Ese snapshot conserva el
-- canon, el deposito, el monto de separacion y el precio del departamento en
-- 1600, que es de donde se habian copiado al generar la adenda. El monto real
-- es 1650 (el mismo del contrato base).
--
-- El mantenimiento (S/ 50) se cobra aparte y ya esta correcto en la adenda; no
-- se toca. Igual que en 0040, la condicion de monto = 1600 hace la migracion
-- idempotente y evita sobrescribir un valor ya corregido.

UPDATE "contract_snapshots"
SET "datos_contrato" = jsonb_set(
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
    ),
    "datos_departamento" = jsonb_set(
      "datos_departamento",
      '{precio}',
      to_jsonb('1650.00'::text)
    )
WHERE "codigo_contrato" = 'BEN2195-7-ADD-1'
  AND "datos_contrato"->>'montoCanonMensual' = '1600.00';
