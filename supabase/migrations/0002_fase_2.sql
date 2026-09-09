--> statement-breakpoint
-- Fase 2: Identidad, usuarios, roles, permisos, clientes y departamentos
--> statement-breakpoint
-- Alinear columnas de clients con el esquema de dominio de Fase 2
ALTER TABLE "clients" RENAME COLUMN "nombre" TO "nombre_completo";
--> statement-breakpoint
ALTER TABLE "clients" RENAME COLUMN "documento" TO "documento_identidad";
--> statement-breakpoint
ALTER TABLE "clients" RENAME CONSTRAINT "clients_documento_unique" TO "clients_documento_identidad_unique";
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "telefono" DROP NOT NULL;
--> statement-breakpoint
-- Usuarios
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'OPERADOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" USING btree ("role");
--> statement-breakpoint
-- Permisos y asignación de permisos por rol
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" varchar(255) NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role" varchar(20) NOT NULL,
	"permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE cascade,
	CONSTRAINT "role_permissions_role_permission_id_unique" UNIQUE("role", "permission_id")
);
--> statement-breakpoint
-- Actividad operativa
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"actor_type" varchar(30) NOT NULL,
	"action" varchar(100) NOT NULL,
	"module" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(100),
	"result" varchar(30) DEFAULT 'SUCCESS' NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_timestamp_idx" ON "activity_events" USING btree ("timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_user_idx" ON "activity_events" USING btree ("user_id");
--> statement-breakpoint
-- Auditoría (append-only)
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario" varchar(255) NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"accion" varchar(100) NOT NULL,
	"entidad" varchar(50) NOT NULL,
	"estado_anterior" jsonb,
	"estado_nuevo" jsonb,
	"resultado" varchar(30) DEFAULT 'SUCCESS' NOT NULL,
	"metadata_segura" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_fecha_idx" ON "audit_events" USING btree ("fecha");