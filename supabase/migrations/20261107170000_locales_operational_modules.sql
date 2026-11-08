ALTER TABLE public.locales
  DROP CONSTRAINT IF EXISTS locales_codigo_check;

ALTER TABLE public.locales
  ADD CONSTRAINT locales_codigo_check CHECK (
    codigo IN (
      'BEN2195-A1', 'BEN2195-A2', 'BEN2195-A3',
      'ANG170-A1', 'ANG170-A2', 'ANG170-A3', 'ANG170-A4', 'ANG170-A5'
    )
  );

INSERT INTO public.locales (codigo, sede, nombre)
VALUES
  ('BEN2195-A1', 'Benavides', 'Local BEN2195-A1'),
  ('BEN2195-A2', 'Benavides', 'Local BEN2195-A2'),
  ('BEN2195-A3', 'Benavides', 'Local BEN2195-A3'),
  ('ANG170-A1', 'Angamos', 'Local ANG170-A1'),
  ('ANG170-A2', 'Angamos', 'Local ANG170-A2'),
  ('ANG170-A3', 'Angamos', 'Local ANG170-A3'),
  ('ANG170-A4', 'Angamos', 'Local ANG170-A4'),
  ('ANG170-A5', 'Angamos', 'Local ANG170-A5')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE public.local_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  nombres varchar(255) NOT NULL,
  apellidos varchar(255) NOT NULL DEFAULT '',
  documento varchar(50) NOT NULL DEFAULT '',
  telefono varchar(30) NOT NULL DEFAULT '',
  email varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_contacts_local_id_idx ON public.local_contacts (local_id);
CREATE INDEX local_contacts_documento_idx ON public.local_contacts (documento);

CREATE TABLE public.local_separations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.local_contacts(id) ON DELETE RESTRICT,
  monto numeric(15, 2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'CANCELADA')),
  fecha date NOT NULL,
  observaciones text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_separations_local_id_idx ON public.local_separations (local_id);
CREATE INDEX local_separations_contact_id_idx ON public.local_separations (contact_id);
CREATE INDEX local_separations_estado_idx ON public.local_separations (estado);

CREATE TABLE public.local_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.local_contacts(id) ON DELETE RESTRICT,
  separation_id uuid REFERENCES public.local_separations(id) ON DELETE SET NULL,
  codigo varchar(50) NOT NULL UNIQUE,
  monto_canon numeric(15, 2) NOT NULL DEFAULT 0 CHECK (monto_canon >= 0),
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR', 'VIGENTE', 'FINALIZADO', 'ANULADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_contracts_fechas_check CHECK (fecha_fin >= fecha_inicio)
);
CREATE INDEX local_contracts_local_id_idx ON public.local_contracts (local_id);
CREATE INDEX local_contracts_contact_id_idx ON public.local_contracts (contact_id);
CREATE INDEX local_contracts_separation_id_idx ON public.local_contracts (separation_id);
CREATE INDEX local_contracts_estado_idx ON public.local_contracts (estado);

CREATE TABLE public.local_annexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.local_contracts(id) ON DELETE CASCADE,
  numero varchar(50) NOT NULL,
  descripcion text NOT NULL,
  fecha date NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR', 'VIGENTE', 'ANULADA')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_annexes_local_id_idx ON public.local_annexes (local_id);
CREATE INDEX local_annexes_contract_id_idx ON public.local_annexes (contract_id);

CREATE TABLE public.local_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  nombre varchar(255) NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  monto numeric(15, 2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  frecuencia varchar(30) NOT NULL DEFAULT 'MENSUAL'
    CHECK (frecuencia IN ('UNICO', 'MENSUAL', 'ANUAL')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_services_local_id_idx ON public.local_services (local_id);
CREATE INDEX local_services_activo_idx ON public.local_services (activo);
