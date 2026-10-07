-- Inventario de ANG170-8 (ingresado por el propietario).
-- Se guarda como lista de ids: ids del catalogo estandar (living-*) o bienes
-- manuales "CUSTOM:<Categoria>:<etiqueta>".
INSERT INTO department_inventories (departamento_id, items, updated_at)
SELECT id,
       '[
         "living-persianas-dos",
         "CUSTOM:Living:01 Mesa",
         "living-luminarias",
         "cocina-cocina",
         "cocina-campana",
         "cocina-gas",
         "cocina-lavadero",
         "CUSTOM:Cocina:01 Frio bar",
         "cocina-microondas",
         "CUSTOM:Cocina:01 mueble arriba 3 puertas",
         "CUSTOM:Cocina:01 mueble abajo 3 puertas",
         "CUSTOM:Dormitorio:01 ropero",
         "CUSTOM:Dormitorio:01 Cama 2 plazas (tarima)",
         "dormitorio-colchon",
         "CUSTOM:Dormitorio:01 TV con rack + control",
         "CUSTOM:Dormitorio:01 decodificador + control",
         "CUSTOM:Dormitorio:01 mesita de noche",
         "bano-espejo",
         "bano-lavamanos",
         "bano-inodoro",
         "bano-ducha",
         "bano-luminarias",
         "CUSTOM:Baño:01 repisa",
         "CUSTOM:Baño:01 porta ph",
         "bano-tacho"
       ]'::jsonb,
       now()
FROM departments
WHERE codigo = 'ANG170-8'
ON CONFLICT (departamento_id) DO UPDATE
  SET items = EXCLUDED.items,
      updated_at = now();