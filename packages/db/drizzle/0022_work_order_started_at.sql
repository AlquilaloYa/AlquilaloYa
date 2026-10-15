ALTER TABLE "work_orders" ADD COLUMN "work_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "work_orders" wo
SET "work_started_at" = e."created_at"
FROM (
	SELECT "work_order_id", MIN("created_at") AS "created_at"
	FROM "work_order_events"
	WHERE "to_status" = 'DIAGNOSIS'
	GROUP BY "work_order_id"
) e
WHERE e."work_order_id" = wo."id" AND wo."work_started_at" IS NULL;
