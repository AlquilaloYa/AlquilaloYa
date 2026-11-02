ALTER TABLE public.payments
  ALTER COLUMN dias_indulgencia SET DEFAULT 7;

UPDATE public.payments
SET dias_indulgencia = 7
WHERE dias_indulgencia = 0
  AND estado IN ('PENDIENTE', 'PARCIAL');
