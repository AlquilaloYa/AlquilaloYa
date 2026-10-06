ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_user_id_key ON public.hr_employees (user_id);