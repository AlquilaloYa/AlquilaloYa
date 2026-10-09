-- Inventario de ANG170-9C (ingresado por el propietario).
-- Se guarda como lista de ids: ids del catalogo estandar (living-*) o bienes
-- manuales "CUSTOM:<Categoria>:<etiqueta>".
INSERT INTO department_inventories (departamento_id, items, updated_at)
SELECT id,
       '[
         "cocina-microondas",
         "cocina-gas",
         "cocina-frigider",
         "cocina-cocina",
         "cocina-campana",
         "CUSTOM:Cocina:01 mueble bajo melamine blanco 3 puertas",
         "CUSTOM:Cocina:01 mueble alto de melamine blanco 2 puertas",
         "cocina-lavadero",
         "CUSTOM:Cocina:02 sillas altas de aluminio y asiento negro",
         "cocina-tacho",
         "CUSTOM:Baño:01 puerta",
         "bano-lavamanos",
         "bano-inodoro",
         "bano-isopo",
         "bano-ducha",
         "bano-tendal",
         "CUSTOM:Baño:01 porta papel",
         "bano-espejo",
         "bano-luminarias",
         "CUSTOM:Baño:01 toallero de metal",
         "dormitorio-closet",
         "CUSTOM:Dormitorio:01 tv con control remoto c/pilas",
         "dormitorio-cama",
         "CUSTOM:Dormitorio:01 repisa de noche",
         "dormitorio-cubre",
         "dormitorio-colchon",
         "dormitorio-luminaria"
       ]'::jsonb,
       now()
FROM departments
WHERE codigo = 'ANG170-9C'
ON CONFLICT (departamento_id) DO UPDATE
  SET items = EXCLUDED.items,
      updated_at = now();
