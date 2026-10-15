CREATE TABLE IF NOT EXISTS public.personas_no_alquilar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombres varchar(255) NOT NULL,
  documento_identidad varchar(50) NOT NULL,
  telefono varchar(30),
  foto_storage_key text,
  foto_mime_type varchar(100),
  creado_por varchar(255),
  eliminado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS personas_no_alquilar_documento_idx
  ON public.personas_no_alquilar (documento_identidad);
