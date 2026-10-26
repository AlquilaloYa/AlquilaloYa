ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS customer_present_at_visit boolean NOT NULL DEFAULT true;

ALTER TABLE public.work_order_attachments
  DROP CONSTRAINT IF EXISTS work_order_attachments_mime_type_check;
ALTER TABLE public.work_order_attachments
  ADD CONSTRAINT work_order_attachments_mime_type_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'));

CREATE TABLE IF NOT EXISTS public.client_portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  email varchar(255) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_accounts_auth_unique UNIQUE (auth_user_id)
);
CREATE INDEX IF NOT EXISTS client_portal_accounts_email_idx
  ON public.client_portal_accounts(email);

CREATE TABLE IF NOT EXISTS public.work_order_availability_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  option_number integer NOT NULL CHECK (option_number BETWEEN 1 AND 3),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  selected_at timestamptz,
  selected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_availability_option_unique UNIQUE (work_order_id, option_number),
  CONSTRAINT work_order_availability_window_check CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS work_order_availability_selected_unique
  ON public.work_order_availability_options(work_order_id)
  WHERE selected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_order_availability_order_idx
  ON public.work_order_availability_options(work_order_id);

CREATE TABLE IF NOT EXISTS public.work_order_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_chats_open_idx
  ON public.work_order_chats(closed_at, opened_at);

CREATE TABLE IF NOT EXISTS public.work_order_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.work_order_chats(id) ON DELETE CASCADE,
  sender_type varchar(20) NOT NULL CHECK (sender_type IN ('CLIENT', 'EMPLOYEE', 'SYSTEM')),
  sender_id uuid,
  sender_name varchar(255) NOT NULL,
  encrypted_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_chat_messages_chat_idx
  ON public.work_order_chat_messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS public.client_portal_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  file_name varchar(255) NOT NULL,
  mime_type varchar(80) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_portal_uploads_client_idx
  ON public.client_portal_uploads(client_id, created_at);
CREATE INDEX IF NOT EXISTS client_portal_uploads_order_idx
  ON public.client_portal_uploads(work_order_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-work-order-evidence',
  'client-work-order-evidence',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE ALL ON TABLE public.client_portal_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_order_availability_options FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_order_chats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_order_chat_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_portal_uploads FROM PUBLIC, anon, authenticated;

ALTER TABLE public.client_portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_availability_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_uploads ENABLE ROW LEVEL SECURITY;
