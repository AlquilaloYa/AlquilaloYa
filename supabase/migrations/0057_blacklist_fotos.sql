-- Las fotos de la lista negra se subían al bucket 'contracts', que solo admite
-- application/pdf; Supabase rechaza image/jpeg con 415 InvalidMimeType.
-- Bucket privado propio + soporte de varias fotos por persona.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blacklist',
  'blacklist',
  false,
  8388608, -- 8 MB por foto
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table personas_no_alquilar
  add column if not exists fotos jsonb not null default '[]'::jsonb;

update personas_no_alquilar
set fotos = jsonb_build_array(jsonb_build_object(
  'key', foto_storage_key,
  'mimeType', coalesce(foto_mime_type, 'image/jpeg'),
  'sizeBytes', 0
))
where foto_storage_key is not null and fotos = '[]'::jsonb;

alter table personas_no_alquilar
  drop column foto_mime_type,
  drop column foto_storage_key;
