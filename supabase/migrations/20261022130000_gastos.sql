-- Panel de Gastos de Contabilidad: comprobantes con foto opcional.
CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL,
  tipo varchar(20) NOT NULL DEFAULT 'PRODUCTO',
  producto varchar(255) NOT NULL,
  monto numeric(15, 2) NOT NULL DEFAULT 0,
  comprobante text,
  comprobante_mime_type varchar(100),
  nota text NOT NULL DEFAULT '',
  creado_por varchar(255) NOT NULL DEFAULT '',
  eliminado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gastos_dia_idx ON public.gastos (dia);
CREATE INDEX IF NOT EXISTS gastos_tipo_idx ON public.gastos (tipo);

-- Bucket privado para los comprobantes de gasto (imágenes o PDF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gastos',
  'gastos',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
