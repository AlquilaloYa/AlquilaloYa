ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_revision_positive" CHECK ("revision" > 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "contracts"
  VALIDATE CONSTRAINT "contracts_revision_positive";
