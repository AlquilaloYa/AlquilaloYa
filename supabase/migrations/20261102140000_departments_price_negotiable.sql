ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS precio_negociable boolean NOT NULL DEFAULT false;
