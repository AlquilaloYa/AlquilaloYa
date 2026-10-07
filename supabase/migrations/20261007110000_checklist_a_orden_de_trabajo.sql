-- Checklist derivado a orden de trabajo: vincula la inspección con la OT creada.
ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "work_order_id" uuid REFERENCES "work_orders" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "inspections_work_order_idx" ON "inspections" ("work_order_id");