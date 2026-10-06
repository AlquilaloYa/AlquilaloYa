ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES public.hr_employees(id);

CREATE INDEX IF NOT EXISTS tasks_empleado_idx ON public.tasks (empleado_id);