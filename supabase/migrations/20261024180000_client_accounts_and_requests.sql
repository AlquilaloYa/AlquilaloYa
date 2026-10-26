CREATE TABLE IF NOT EXISTS public.client_work_order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  issue_type varchar(80) NOT NULL,
  description text NOT NULL,
  customer_present_at_visit boolean NOT NULL DEFAULT true,
  availability_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONVERTED', 'REJECTED')),
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_work_order_requests_work_order_unique UNIQUE (work_order_id)
);

ALTER TABLE public.client_portal_accounts
  ADD COLUMN IF NOT EXISTS password_ciphertext text,
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credential_period_key varchar(255);

ALTER TABLE public.client_portal_uploads
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.client_work_order_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS client_work_order_requests_client_idx
  ON public.client_work_order_requests(client_id, created_at);
CREATE INDEX IF NOT EXISTS client_work_order_requests_status_idx
  ON public.client_work_order_requests(status, created_at);
CREATE INDEX IF NOT EXISTS client_portal_uploads_request_idx
  ON public.client_portal_uploads(request_id);

REVOKE ALL ON TABLE public.client_work_order_requests FROM PUBLIC, anon, authenticated;
ALTER TABLE public.client_work_order_requests ENABLE ROW LEVEL SECURITY;
