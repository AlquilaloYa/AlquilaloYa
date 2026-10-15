ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS work_started_at timestamptz;

UPDATE public.work_orders wo
SET work_started_at = e.created_at
FROM (
  SELECT work_order_id, MIN(created_at) AS created_at
  FROM public.work_order_events
  WHERE to_status = 'DIAGNOSIS'
  GROUP BY work_order_id
) e
WHERE e.work_order_id = wo.id
  AND wo.work_started_at IS NULL;
