-- 0010: Permitir subir PDF en plantillas de contrato.
-- contenido pasa a ser nullable (la plantilla puede ser solo PDF).
-- Se agregan columnas para almacenar la referencia al PDF en Storage.

ALTER TABLE template_versions
  ALTER COLUMN contenido DROP NOT NULL;

ALTER TABLE template_versions
  ADD COLUMN pdf_storage_key text,
  ADD COLUMN pdf_filename text;
