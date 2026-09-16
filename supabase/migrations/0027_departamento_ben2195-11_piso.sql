-- BEN2195-11 se ubica en el piso 2 (corrección de datos)
UPDATE "departments"
SET "piso" = 2, "updated_at" = now()
WHERE "codigo" = 'BEN2195-11';