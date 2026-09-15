-- 0026: nacionalidad en contacts y clients
alter table public.contacts
  add column if not exists nacionalidad varchar(50);

alter table public.clients
  add column if not exists nacionalidad varchar(50);