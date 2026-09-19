-- BEN2195-7 pasa a S/ 1650 de mensualidad y garantía
UPDATE "departments"
SET "precio" = 1650, "garantia" = 1650, "updated_at" = now()
WHERE "codigo" = 'BEN2195-7';