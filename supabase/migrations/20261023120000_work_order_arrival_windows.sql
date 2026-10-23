-- Ventanas de llegada en órdenes de trabajo y visitas.
-- Equivale a la migración Drizzle `packages/db/drizzle/0023_work_order_arrival_windows.sql`.
-- Idempotente: agrega el fin de la ventana y completa datos existentes con 2 horas.
ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "arrival_window_end" timestamptz;

ALTER TABLE "work_order_visits"
  ADD COLUMN IF NOT EXISTS "arrival_window_end" timestamptz;

UPDATE "work_orders"
SET "arrival_window_end" = "target_at" + interval '2 hours'
WHERE "arrival_window_end" IS NULL
  AND "target_at" IS NOT NULL;

UPDATE "work_order_visits"
SET "arrival_window_end" = "scheduled_at" + interval '2 hours'
WHERE "arrival_window_end" IS NULL;
