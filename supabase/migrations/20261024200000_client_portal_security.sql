ALTER TABLE public.client_portal_accounts
  DROP COLUMN IF EXISTS password_ciphertext;

CREATE TABLE IF NOT EXISTS public.client_portal_rate_limits (
  key text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_portal_rate_limits_window_idx
  ON public.client_portal_rate_limits(window_started_at);

REVOKE ALL ON TABLE public.client_portal_rate_limits FROM PUBLIC, anon, authenticated;
ALTER TABLE public.client_portal_rate_limits ENABLE ROW LEVEL SECURITY;
