ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid
  REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.tasks AS task
SET created_by_user_id = app_user.id
FROM public.users AS app_user
WHERE task.created_by_user_id IS NULL
  AND lower(task.creado_por) = lower(app_user.email);

UPDATE public.tasks AS task
SET created_by_user_id = app_user.id
FROM public.users AS app_user
WHERE task.created_by_user_id IS NULL
  AND lower(task.creado_por) = lower(app_user.name)
  AND (
    SELECT count(*)
    FROM public.users AS matching_user
    WHERE lower(matching_user.name) = lower(task.creado_por)
  ) = 1;

CREATE TABLE IF NOT EXISTS public.task_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS task_push_subscriptions_user_idx
  ON public.task_push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.task_push_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  slot varchar(16) NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_push_reminders_task_slot_unique UNIQUE (task_id, slot)
);
