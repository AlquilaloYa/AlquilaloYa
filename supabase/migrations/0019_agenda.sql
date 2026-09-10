-- 0019: token de Google Calendar por usuario (agenda personal, Work 123 -> Agenda)
drop table if exists public.agenda_events;

create table if not exists public.user_google_tokens (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) not null unique,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text not null default '',
  calendar_id varchar(255) not null default 'primary',
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);