ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "client_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_client_id_clients_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
