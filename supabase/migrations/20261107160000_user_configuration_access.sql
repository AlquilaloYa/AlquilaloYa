ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS configuration_access boolean NOT NULL DEFAULT true;
