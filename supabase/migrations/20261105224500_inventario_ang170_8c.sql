-- Inventario de ANG170-8C (ingresado por el propietario).
-- Se guarda como lista de ids del catálogo y bienes manuales "CUSTOM:<Categoria>:<etiqueta>".
INSERT INTO department_inventories (departamento_id, items, updated_at)
SELECT id,
       '[
         "CUSTOM:Cocina:01 mueble blanco alto 2 puertas",
         "CUSTOM:Cocina:01 microondas",
         "CUSTOM:Cocina:01 campana Electrolux",
         "CUSTOM:Cocina:01 cocina",
         "CUSTOM:Cocina:01 friobar",
         "cocina-gas",
         "cocina-lavadero",
         "CUSTOM:Cocina:02 bancos de metal blanco",
         "CUSTOM:Dormitorio:01 TV android",
         "CUSTOM:Dormitorio:01 mini closet empotrado 2 puertas",
         "CUSTOM:Dormitorio:01 cama de 2 plazas",
         "dormitorio-colchon",
         "dormitorio-cubre",
         "dormitorio-persiana",
         "CUSTOM:Dormitorio:02 luminarias",
         "dormitorio-espejo-grande",
         "CUSTOM:Baño:01 lavamanos",
         "CUSTOM:Baño:01 inodoro",
         "bano-ducha",
         "bano-espejo",
         "CUSTOM:Baño:01 tendedero de metal",
         "CUSTOM:Baño:01 toallero de metal",
         "CUSTOM:Baño:01 luminaria"
       ]'::jsonb,
       now()
FROM departments
WHERE codigo = 'ANG170-8C'
ON CONFLICT (departamento_id) DO UPDATE
  SET items = EXCLUDED.items,
      updated_at = now();
