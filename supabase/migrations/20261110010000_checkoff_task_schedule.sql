ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS hora_ejecucion varchar(5) NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS repetir_cada_hora boolean NOT NULL DEFAULT false;
