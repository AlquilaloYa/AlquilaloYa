-- Fase 4: Document Engine, PDF, Storage e integridad
-- Bucket privado 'contracts' para PDFs de contratos y adendas.
-- Solo el server (service_role key) lee/escribe; sin políticas públicas (RLS por defecto).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contracts',
  'contracts',
  false,
  52428800, -- 50 MB
  ARRAY['application/pdf']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
