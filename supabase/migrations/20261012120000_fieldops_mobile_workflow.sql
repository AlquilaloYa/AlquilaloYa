-- FieldOps Mobile: campos del flujo de trabajo móvil (resolución/cierre,
-- visitas y evidencias). Equivale a la migración Drizzle
-- `packages/db/drizzle/0019_fieldops_mobile_workflow.sql`. Idempotente.
ALTER TABLE "work_orders"
	ADD COLUMN IF NOT EXISTS "cause" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "observations" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "materials_confirmed" boolean DEFAULT false NOT NULL,
	ADD COLUMN IF NOT EXISTS "can_resolve_today" boolean DEFAULT true NOT NULL;

ALTER TABLE "work_order_visits"
	ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "is_customer_appointment" boolean DEFAULT false NOT NULL,
	ADD COLUMN IF NOT EXISTS "customer_name" varchar(255) DEFAULT '' NOT NULL;

ALTER TABLE "work_order_attachments"
	ADD COLUMN IF NOT EXISTS "kind" varchar(40) DEFAULT 'EVIDENCIA' NOT NULL,
	ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;
