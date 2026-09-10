-- 0015: inspecciones - campo "persona que inspecciona" (se retira el contacto inspeccionado de la UI)
alter table public.inspections
  add column if not exists persona_inspecciona varchar(255) not null default '';
