CREATE TABLE IF NOT EXISTS public.fieldops_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform varchar(20) NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fieldops_push_tokens_token_key
  ON public.fieldops_push_tokens (token);

CREATE INDEX IF NOT EXISTS fieldops_push_tokens_user_id_idx
  ON public.fieldops_push_tokens (user_id);
