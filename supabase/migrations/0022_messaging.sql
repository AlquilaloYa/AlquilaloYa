-- 0022: bandeja de conversaciones multicanal + plantillas de mensajes
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  canal varchar(30) not null default 'MANUAL',
  externo_id varchar(255),
  contacto_nombre varchar(255) not null default '',
  contacto_telefono varchar(50) not null default '',
  lead_id uuid references public.leads(id) on delete set null,
  estado varchar(20) not null default 'ABIERTA',
  asignado_a varchar(255) not null default '',
  ultimo_mensaje text not null default '',
  ultimo_mensaje_en timestamptz,
  no_leidos integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conversations_canal_externo_unique
  on public.conversations (canal, externo_id) where externo_id is not null;
create index if not exists conversations_estado_idx on public.conversations (estado);
create index if not exists conversations_asignado_idx on public.conversations (asignado_a);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direccion varchar(10) not null default 'INBOUND',
  autor varchar(255) not null default '',
  contenido text not null default '',
  externo_msg_id varchar(255),
  estado varchar(20) not null default 'ENVIADO',
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create unique index if not exists messages_externo_unique
  on public.messages (conversation_id, externo_msg_id) where externo_msg_id is not null;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null unique,
  canal varchar(30) not null default 'TODOS',
  cuerpo text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
