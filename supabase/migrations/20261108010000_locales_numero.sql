ALTER TABLE public.locales
  ADD COLUMN IF NOT EXISTS numero varchar(2);

UPDATE public.locales
SET numero = split_part(codigo, '-', 2)
WHERE numero IS NULL;

ALTER TABLE public.locales
  ALTER COLUMN numero SET NOT NULL;

ALTER TABLE public.locales
  DROP CONSTRAINT IF EXISTS locales_numero_check,
  ADD CONSTRAINT locales_numero_check
    CHECK (numero IN ('A1', 'A2', 'A3', 'A4', 'A5'));

ALTER TABLE public.locales
  DROP CONSTRAINT IF EXISTS locales_codigo_numero_check,
  ADD CONSTRAINT locales_codigo_numero_check
    CHECK (split_part(codigo, '-', 2) = numero);

CREATE UNIQUE INDEX IF NOT EXISTS locales_sede_numero_unique
  ON public.locales (sede, numero);
