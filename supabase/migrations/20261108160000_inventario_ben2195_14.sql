-- Inventario proporcionado para BEN2195-14.
-- Conserva los elementos existentes y agrega solo los que aún no estén registrados.
WITH additions AS (
  SELECT item, ordinal
  FROM jsonb_array_elements_text(
    '[
      "CUSTOM:Living:01 puerta intacta",
      "CUSTOM:Living:02 puff",
      "CUSTOM:Living:01 TV con control remoto",
      "CUSTOM:Dormitorio:01 cama de 2 plazas",
      "dormitorio-colchon",
      "dormitorio-espejo-grande",
      "CUSTOM:Dormitorio:01 persiana nueva",
      "CUSTOM:Dormitorio:01 estante de madera",
      "CUSTOM:Dormitorio:01 closet de 2 puertas",
      "CUSTOM:Dormitorio:01 mesa con 2 sillas",
      "cocina-lavadero",
      "cocina-cocina",
      "cocina-gas",
      "CUSTOM:Cocina:01 frigider de 2 puertas",
      "cocina-microondas",
      "CUSTOM:Cocina:01 campana extractora",
      "cocina-mueble",
      "CUSTOM:Cocina:Luminarias",
      "bano-espejo",
      "bano-lavamanos",
      "bano-ducha",
      "bano-tendal",
      "bano-inodoro",
      "bano-accesorios",
      "bano-tacho",
      "bano-luminarias"
    ]'::jsonb
  ) WITH ORDINALITY AS item_list(item, ordinal)
),
target AS (
  SELECT d.id, COALESCE(i.items, '[]'::jsonb) AS existing_items
  FROM public.departments AS d
  LEFT JOIN public.department_inventories AS i
    ON i.departamento_id = d.id
  WHERE d.codigo = 'BEN2195-14'
),
combined AS (
  SELECT old_item.item, 0 AS source_order, old_item.ordinal AS item_order
  FROM target
  CROSS JOIN LATERAL jsonb_array_elements_text(target.existing_items)
    WITH ORDINALITY AS old_item(item, ordinal)

  UNION ALL

  SELECT additions.item, 1 AS source_order, additions.ordinal AS item_order
  FROM target
  CROSS JOIN additions
  WHERE NOT target.existing_items @> jsonb_build_array(additions.item)
),
inventory AS (
  SELECT jsonb_agg(item ORDER BY source_order, item_order) AS items
  FROM combined
)
INSERT INTO public.department_inventories (departamento_id, items, updated_at)
SELECT target.id, COALESCE(inventory.items, '[]'::jsonb), now()
FROM target
CROSS JOIN inventory
ON CONFLICT (departamento_id) DO UPDATE
SET items = EXCLUDED.items,
    updated_at = now();
