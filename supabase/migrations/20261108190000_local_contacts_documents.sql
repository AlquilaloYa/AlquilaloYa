ALTER TABLE public.local_contacts
  ADD COLUMN contacto_emergencia jsonb,
  ADD COLUMN copia_dni jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN copia_boletas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN copia_antecedentes jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.local_contacts
  ALTER COLUMN mascotas_items DROP DEFAULT,
  ALTER COLUMN mascotas_items TYPE jsonb
    USING CASE
      WHEN btrim(mascotas_items) = '' THEN '[]'::jsonb
      ELSE to_jsonb(string_to_array(mascotas_items, ','))
    END,
  ALTER COLUMN mascotas_items SET DEFAULT '[]'::jsonb;

UPDATE public.local_contacts
SET contacto_emergencia = jsonb_build_object(
  'nombre', contacto_emergencia_nombre,
  'parentesco', contacto_emergencia_parentesco,
  'telefono', contacto_emergencia_telefono
)
WHERE contacto_emergencia_nombre <> ''
   OR contacto_emergencia_parentesco <> ''
   OR contacto_emergencia_telefono <> '';

ALTER TABLE public.local_contacts
  DROP COLUMN contacto_emergencia_nombre,
  DROP COLUMN contacto_emergencia_parentesco,
  DROP COLUMN contacto_emergencia_telefono;
