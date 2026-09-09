--> statement-breakpoint
-- Fase 6: Capa de conectores/integraciones
-- - connector_instances: instancias de conectores configurados
-- - connector_credentials: credenciales cifradas (nunca tokens en texto plano)
-- - connector_logs: log de despachos para actividad, reintentos y DLQ
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'ENABLED' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"credential_id" uuid,
	"created_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_instances_type_idx" ON "connector_instances" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_instances_provider_idx" ON "connector_instances" USING btree ("provider");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL REFERENCES "connector_instances"("id") ON DELETE cascade,
	"auth_type" varchar(30) NOT NULL,
	"encrypted" text NOT NULL,
	"fingerprint" varchar(64),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_credentials_connector_idx" ON "connector_credentials" USING btree ("connector_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"status_code" integer,
	"payload" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_logs_connector_idx" ON "connector_logs" USING btree ("connector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_logs_created_idx" ON "connector_logs" USING btree ("created_at");