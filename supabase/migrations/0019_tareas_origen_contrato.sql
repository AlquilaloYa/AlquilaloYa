-- 0019: tareas con origen (tareas automaticas derivadas de contratos)
alter table public.tasks
  add column if not exists origen_tipo varchar(30) not null default 'MANUAL';
alter table public.tasks
  add column if not exists origen_contrato_id uuid;
alter table public.tasks
  add column if not exists origen_evento varchar(20);

create index if not exists tasks_origen_contrato_idx
  on public.tasks (origen_contrato_id, origen_evento);
