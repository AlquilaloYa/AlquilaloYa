CREATE TABLE IF NOT EXISTS public.tenant_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients (id),
  tipo varchar(30) NOT NULL DEFAULT 'CONVIVENCIA',
  severidad varchar(20) NOT NULL DEFAULT 'MEDIA',
  descripcion text NOT NULL DEFAULT '',
  departamento_codigo varchar(50),
  creado_por varchar(255),
  eliminado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_incidents_cliente_idx
  ON public.tenant_incidents (cliente_id);

CREATE INDEX IF NOT EXISTS tenant_incidents_tipo_idx
  ON public.tenant_incidents (tipo);
