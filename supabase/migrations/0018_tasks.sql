-- 0018: tareas de trabajo interno asignadas (Work 123)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  titulo varchar(255) not null,
  descripcion text not null default '',
  asignado_a varchar(255) not null default '',
  fecha_limite timestamptz not null,
  estado varchar(30) not null default 'PENDIENTE',
  creado_por varchar(255) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_estado_idx on public.tasks (estado);
create index if not exists tasks_fecha_limite_idx on public.tasks (fecha_limite);
create index if not exists tasks_asignado_idx on public.tasks (asignado_a);