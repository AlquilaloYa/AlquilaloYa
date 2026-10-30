ALTER TABLE public.work_order_attachments
  DROP CONSTRAINT IF EXISTS work_order_attachments_size_bytes_check;
ALTER TABLE public.work_order_attachments
  ADD CONSTRAINT work_order_attachments_size_bytes_check
    CHECK (size_bytes > 0 AND size_bytes <= 52428800);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-order-evidence',
  'work-order-evidence',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
