-- 0013: contactos, separaciones e inventarios departamentales: de localStorage a la BD
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(255) not null,
  apellido varchar(255) not null default '',
  tipo_persona varchar(20) not null default 'NATURAL',
  dni varchar(30) not null default '',
  ruc varchar(20),
  email varchar(255) not null default '',
  telefono varchar(40),
  domicilio text,
  contacto_emergencia jsonb,
  mascotas boolean not null default false,
  mascotas_items jsonb not null default '[]'::jsonb,
  copia_dni jsonb not null default '[]'::jsonb,
  copia_boletas jsonb not null default '[]'::jsonb,
  copia_antecedentes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_dni_idx on public.contacts (dni);
create index if not exists contacts_email_idx on public.contacts (email);

create table if not exists public.separations (
  id uuid primary key default gen_random_uuid(),
  departamento_id uuid not null references public.departments(id) on delete cascade,
  contacto_id uuid references public.contacts(id) on delete set null,
  monto_separacion numeric(12, 2) not null default 500,
  tipo_separacion varchar(20) not null default '500',
  garantia_extendida boolean not null default false,
  baucher_garantia_extendida text,
  fecha_garantia_extendida timestamptz,
  fecha_separacion timestamptz not null default now(),
  dias_tiempo integer,
  fecha_limite_manual timestamptz,
  baucher_separacion text,
  estado varchar(30) not null default 'SEPARADO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint separations_departamento_unique unique (departamento_id)
);

create index if not exists separations_contacto_idx on public.separations (contacto_id);

create table if not exists public.department_inventories (
  id uuid primary key default gen_random_uuid(),
  departamento_id uuid not null references public.departments(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_inventories_departamento_unique unique (departamento_id)
);
