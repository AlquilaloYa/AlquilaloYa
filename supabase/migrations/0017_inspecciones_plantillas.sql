-- 0017: plantillas de checklist + categorias + numero de departamento
create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(255) not null,
  categorias jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inspections
  add column if not exists numero varchar(20) not null default '';
