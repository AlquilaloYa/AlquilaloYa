CREATE TABLE IF NOT EXISTS public.client_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL
    CHECK (type IN ('REQUEST_CONVERTED', 'VISIT_CONFIRMED')),
  title varchar(180) NOT NULL,
  body text NOT NULL,
  dedupe_key varchar(255) NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_notifications_client_dedupe_unique
    UNIQUE (client_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS client_portal_notifications_client_created_idx
  ON public.client_portal_notifications(client_id, created_at DESC);

REVOKE ALL ON TABLE public.client_portal_notifications FROM PUBLIC, anon, authenticated;
ALTER TABLE public.client_portal_notifications ENABLE ROW LEVEL SECURITY;
