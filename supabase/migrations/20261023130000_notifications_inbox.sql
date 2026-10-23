CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(40) NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "href" varchar(500) NOT NULL,
  "entity_type" varchar(40) NOT NULL,
  "entity_id" uuid NOT NULL,
  "dedupe_key" varchar(255) NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamptz,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_user_dedupe_unique" UNIQUE("user_id", "dedupe_key")
);

CREATE INDEX IF NOT EXISTS "notifications_user_created_idx"
  ON "notifications" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "is_read" = false AND "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_contract_expiry_unique"
  ON "tasks" ("origen_contrato_id", "origen_evento")
  WHERE "origen_contrato_id" IS NOT NULL AND "origen_evento" = 'VENCIMIENTO';
