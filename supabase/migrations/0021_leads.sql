-- 0021: pipeline de leads multicanal (Fase 0 mensajería/CRM)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null,
  apellido varchar(150) not null default '',
  contacto_id uuid references public.contacts(id) on delete set null,
  canal varchar(30) not null default 'MANUAL',
  etapa varchar(30) not null default 'ENTRANTE',
  servicio varchar(255) not null default '',
  monto numeric(15,2) not null default 0,
  tags jsonb not null default '[]',
  asignado_a varchar(255) not null default '',
  vence_el date,
  notas text not null default '',
  origen_externo_id varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canal, origen_externo_id)
);

create index if not exists leads_etapa_idx on public.leads (etapa);
create index if not exists leads_canal_idx on public.leads (canal);
create index if not exists leads_asignado_idx on public.leads (asignado_a);
