ALTER TABLE "tasks"
  ADD COLUMN "created_by_user_id" uuid
  REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
UPDATE "tasks" AS task
SET "created_by_user_id" = app_user."id"
FROM "users" AS app_user
WHERE task."created_by_user_id" IS NULL
  AND lower(task."creado_por") = lower(app_user."email");
--> statement-breakpoint
UPDATE "tasks" AS task
SET "created_by_user_id" = app_user."id"
FROM "users" AS app_user
WHERE task."created_by_user_id" IS NULL
  AND lower(task."creado_por") = lower(app_user."name")
  AND (
    SELECT count(*)
    FROM "users" AS matching_user
    WHERE lower(matching_user."name") = lower(task."creado_por")
  ) = 1;
--> statement-breakpoint
CREATE TABLE "task_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "task_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "task_push_subscriptions_user_idx"
  ON "task_push_subscriptions" ("user_id");
--> statement-breakpoint
CREATE TABLE "task_push_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "slot" varchar(16) NOT NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "task_push_reminders_task_slot_unique" UNIQUE("task_id", "slot")
);
