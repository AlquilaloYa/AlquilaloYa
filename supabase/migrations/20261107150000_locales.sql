CREATE TABLE IF NOT EXISTS public.locales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo varchar(32) NOT NULL UNIQUE,
  sede varchar(20) NOT NULL,
  nombre varchar(255) NOT NULL,
  area_m2 numeric(10, 2) NOT NULL DEFAULT 0,
  precio_alquiler numeric(15, 2) NOT NULL DEFAULT 0,
  garantia numeric(15, 2) NOT NULL DEFAULT 0,
  mantenimiento numeric(15, 2) NOT NULL DEFAULT 0,
  servicios text NOT NULL DEFAULT '',
  pago_luz_porcentaje numeric(5, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locales_codigo_check CHECK (
    codigo IN ('BEN2195-A1', 'BEN2195-A2', 'BEN2195-A3', 'ANG170-A1', 'ANG170-A2', 'ANG170-A3')
  ),
  CONSTRAINT locales_sede_check CHECK (sede IN ('Benavides', 'Angamos')),
  CONSTRAINT locales_codigo_sede_check CHECK (
    (codigo LIKE 'BEN2195-%' AND sede = 'Benavides') OR
    (codigo LIKE 'ANG170-%' AND sede = 'Angamos')
  ),
  CONSTRAINT locales_area_m2_check CHECK (area_m2 >= 0),
  CONSTRAINT locales_precio_alquiler_check CHECK (precio_alquiler >= 0),
  CONSTRAINT locales_garantia_check CHECK (garantia >= 0),
  CONSTRAINT locales_mantenimiento_check CHECK (mantenimiento >= 0),
  CONSTRAINT locales_pago_luz_porcentaje_check CHECK (pago_luz_porcentaje BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS locales_sede_idx ON public.locales (sede);

CREATE TABLE IF NOT EXISTS public.local_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  nombre varchar(255) NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  uploaded_by varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_files_local_id_idx ON public.local_files (local_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'local-assets',
  'local-assets',
  false,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
