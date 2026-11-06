ALTER TABLE public.payments
  ALTER COLUMN dias_indulgencia SET DEFAULT 0;

UPDATE public.payments
SET dias_indulgencia = 0
WHERE dias_indulgencia = 7;
