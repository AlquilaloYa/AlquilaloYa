ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_revision_positive CHECK (revision > 0) NOT VALID;

ALTER TABLE public.contracts
  VALIDATE CONSTRAINT contracts_revision_positive;
