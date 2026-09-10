-- 0014: sistema de inspecciones (checklist) - banco de preguntas + inspecciones
create table if not exists public.inspection_questions (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_questions_orden_idx on public.inspection_questions (orden);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references public.contacts (id) on delete set null,
  contacto_nombre varchar(511) not null default '',
  inspector_id varchar(255) not null default '',
  inspector_nombre varchar(255) not null default '',
  departamento_id uuid,
  departamento_nombre varchar(255) not null default '',
  asignado_a varchar(255) not null default '',
  fecha timestamptz not null default now(),
  estado varchar(30) not null default 'BORRADOR',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists inspections_estado_idx on public.inspections (estado);
create index if not exists inspections_fecha_idx on public.inspections (fecha);
create index if not exists inspections_contacto_idx on public.inspections (contacto_id);
