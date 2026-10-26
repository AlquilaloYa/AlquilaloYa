CREATE TABLE IF NOT EXISTS public.issue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issue_types_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS issue_types_active_order_idx
  ON public.issue_types(is_active, display_order);

INSERT INTO public.issue_types (name, display_order)
VALUES
  ('Plomeria', 1),
  ('Electricidad', 2),
  ('Cerrajeria', 3),
  ('Limpieza', 4),
  ('Mantenimiento', 5),
  ('Otro', 6)
ON CONFLICT (name) DO UPDATE
SET is_active = true,
    display_order = EXCLUDED.display_order;

ALTER TABLE public.client_work_order_requests
  ADD COLUMN IF NOT EXISTS issue_type_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_work_order_requests'
      AND column_name = 'issue_type'
  ) THEN
    INSERT INTO public.issue_types (name)
    SELECT DISTINCT btrim(issue_type)
    FROM public.client_work_order_requests
    WHERE issue_type IS NOT NULL
      AND btrim(issue_type) <> ''
    ON CONFLICT (name) DO NOTHING;

    UPDATE public.client_work_order_requests AS requests
    SET issue_type_id = types.id
    FROM public.issue_types AS types
    WHERE requests.issue_type_id IS NULL
      AND types.name = btrim(requests.issue_type);
  END IF;
END
$$;

INSERT INTO public.issue_types (name, display_order)
VALUES ('Otro', 6)
ON CONFLICT (name) DO NOTHING;

UPDATE public.client_work_order_requests
SET issue_type_id = (
  SELECT id
  FROM public.issue_types
  WHERE name = 'Otro'
)
WHERE issue_type_id IS NULL;

ALTER TABLE public.client_work_order_requests
  ALTER COLUMN issue_type_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_work_order_requests_issue_type_id_fkey'
      AND conrelid = 'public.client_work_order_requests'::regclass
  ) THEN
    ALTER TABLE public.client_work_order_requests
      ADD CONSTRAINT client_work_order_requests_issue_type_id_fkey
      FOREIGN KEY (issue_type_id)
      REFERENCES public.issue_types(id)
      ON DELETE RESTRICT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_work_order_requests'
      AND column_name = 'issue_type'
  ) THEN
    ALTER TABLE public.client_work_order_requests
      DROP COLUMN issue_type;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS client_work_order_requests_issue_type_idx
  ON public.client_work_order_requests(issue_type_id);

REVOKE ALL ON TABLE public.issue_types FROM PUBLIC, anon, authenticated;
ALTER TABLE public.issue_types ENABLE ROW LEVEL SECURITY;
