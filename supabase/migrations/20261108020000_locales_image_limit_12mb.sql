ALTER TABLE public.local_files
  DROP CONSTRAINT IF EXISTS local_files_size_bytes_check,
  ADD CONSTRAINT local_files_size_bytes_check
    CHECK (size_bytes > 0 AND size_bytes <= 12582912),
  ADD CONSTRAINT local_files_mime_size_check
    CHECK (
      (mime_type = 'application/pdf' AND size_bytes <= 8388608)
      OR (
        mime_type IN ('image/jpeg', 'image/png', 'image/webp')
        AND size_bytes <= 12582912
      )
    );

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'local-assets',
  'local-assets',
  false,
  12582912,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
