ALTER TABLE public.local_contacts
  ADD COLUMN IF NOT EXISTS cliente_activo boolean NOT NULL DEFAULT true;
