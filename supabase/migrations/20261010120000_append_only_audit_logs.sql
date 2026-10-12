-- SEC-052 — Logs de auditoría y actividad append-only.
--
-- Impide UPDATE/DELETE sobre `audit_events` y `activity_events` mediante un
-- trigger que lanza excepción. Se aplica también al propietario de la tabla
-- (el propietario no puede saltarse FORCE RLS, pero sí sus privilegios; el
-- trigger sí lo bloquea), de modo que ni la aplicación ni un operador puedan
-- alterar o borrar el histórico.
--
-- No afecta a INSERT (incluido COPY/pg_restore), por lo que la restauración de
-- backups sigue funcionando.

create or replace function public.prevent_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only: %.% no admite %', tg_table_schema, tg_table_name, tg_op
    using errcode = '55000';
end;
$$;

drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function public.prevent_log_mutation();

drop trigger if exists activity_events_append_only on public.activity_events;
create trigger activity_events_append_only
  before update or delete on public.activity_events
  for each row execute function public.prevent_log_mutation();
