-- 0024: bot de respuestas por canal (reglas determinísticas con plantillas)
create table if not exists public.bot_rules (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null unique,
  canal varchar(30) not null default 'WHATSAPP',
  keywords jsonb not null default '[]',
  plantilla_id uuid references public.message_templates(id) on delete set null,
  cuerpo text not null default '',
  una_por_conversacion boolean not null default true,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bot_rules_canal_idx on public.bot_rules (canal, activa);
