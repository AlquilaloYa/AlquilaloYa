-- 0023: motor de automatizaciones (reglas evento → acciones, sin IA)
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null unique,
  evento varchar(40) not null,
  params jsonb not null default '{}',
  acciones jsonb not null default '[]',
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.automation_rules(id) on delete cascade,
  fuente varchar(10) not null default 'MANUAL',
  detalle jsonb not null default '{}',
  ejecutado_en timestamptz not null default now()
);

create index if not exists automation_runs_rule_idx on public.automation_runs (rule_id, ejecutado_en);
