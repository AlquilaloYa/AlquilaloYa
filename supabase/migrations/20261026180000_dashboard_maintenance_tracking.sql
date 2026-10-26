ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS maintenance_reason varchar(1000),
  ADD COLUMN IF NOT EXISTS maintenance_estimated_days integer,
  ADD COLUMN IF NOT EXISTS maintenance_stage varchar(20) NOT NULL DEFAULT 'PENDIENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departments_maintenance_estimated_days_check'
      AND conrelid = 'public.departments'::regclass
  ) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_maintenance_estimated_days_check
      CHECK (maintenance_estimated_days IS NULL OR maintenance_estimated_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departments_maintenance_stage_check'
      AND conrelid = 'public.departments'::regclass
  ) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_maintenance_stage_check
      CHECK (maintenance_stage IN ('PENDIENTE', 'DIAGNOSTICO', 'REPARACION', 'VERIFICACION'));
  END IF;
END
$$;
