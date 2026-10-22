ALTER TABLE public.personas_no_alquilar
  ADD COLUMN IF NOT EXISTS motivo text;
