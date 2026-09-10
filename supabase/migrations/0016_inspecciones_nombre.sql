-- 0016: inspecciones - nombre del checklist (se usa el numero de departamento por defecto)
alter table public.inspections
  add column if not exists nombre varchar(255) not null default '';
