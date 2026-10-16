DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'MANTENIMIENTO';
  END IF;
END
$$;
