ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "arrival_window_end" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "work_order_visits" ADD COLUMN IF NOT EXISTS "arrival_window_end" timestamp with time zone;
--> statement-breakpoint
UPDATE "work_orders"
SET "arrival_window_end" = "target_at" + interval '2 hours'
WHERE "arrival_window_end" IS NULL AND "target_at" IS NOT NULL;
--> statement-breakpoint
UPDATE "work_order_visits"
SET "arrival_window_end" = "scheduled_at" + interval '2 hours'
WHERE "arrival_window_end" IS NULL;
