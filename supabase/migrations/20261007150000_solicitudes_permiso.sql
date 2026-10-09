-- Limpia las filas de la matriz de permisos de los roles eliminados.
DELETE FROM "role_permissions" WHERE "role" IN ('OPERADOR', 'SUPERVISOR', 'AUDITOR', 'FIRMANTE');

-- Solicitudes de permiso: la ven y aprueban el Developer y los Administradores.
CREATE TABLE IF NOT EXISTS "permission_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"user_name" varchar(255) NOT NULL,
	"user_role" varchar(40) NOT NULL,
	"modulo" varchar(120) NOT NULL,
	"detalle" text NOT NULL,
	"estado" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"comentario" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "permission_requests_user_idx" ON "permission_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "permission_requests_estado_idx" ON "permission_requests" ("estado");

