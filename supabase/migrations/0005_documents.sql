--> statement-breakpoint
-- Fase 4: Document Engine, PDF, Storage e integridad
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE cascade,
	"snapshot_id" uuid NOT NULL REFERENCES "contract_snapshots"("id"),
	"tipo" varchar(50) DEFAULT 'CONTRATO_PDF' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer,
	"sha256" varchar(64),
	"estado_generacion" varchar(30) DEFAULT 'REQUESTED' NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_contract_idx" ON "documents" USING btree ("contract_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_snapshot_idx" ON "documents" USING btree ("snapshot_id");