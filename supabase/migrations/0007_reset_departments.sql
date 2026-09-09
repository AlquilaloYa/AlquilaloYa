-- Fase 5: Reset completo y reestructuración de departamentos
-- Eliminar tablas dependientes primero
DROP TABLE IF EXISTS "contract_clauses" CASCADE;
DROP TABLE IF EXISTS "contract_annexes" CASCADE;
DROP TABLE IF EXISTS "contract_snapshots" CASCADE;
DROP TABLE IF EXISTS "contracts" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "documents" CASCADE;
DROP TABLE IF EXISTS "clients" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "permissions" CASCADE;
DROP TABLE IF EXISTS "role_permissions" CASCADE;
DROP TABLE IF EXISTS "activity_events" CASCADE;
DROP TABLE IF EXISTS "audit_events" CASCADE;
DROP TABLE IF EXISTS "connector_instances" CASCADE;
DROP TABLE IF EXISTS "connector_credentials" CASCADE;
DROP TABLE IF EXISTS "connector_logs" CASCADE;

-- Recrear departments con estructura fija
DROP TABLE IF EXISTS "departments" CASCADE;

CREATE TABLE "departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "codigo" varchar(50) NOT NULL UNIQUE,
  "nombre" varchar(255) NOT NULL,
  "numero" varchar(10) NOT NULL,
  "tipo" varchar(50) NOT NULL DEFAULT 'Departamento',
  "persona_pago" varchar(255) NOT NULL,
  "piso" integer NOT NULL DEFAULT 1,
  "precio" numeric(15,2) NOT NULL DEFAULT 0,
  "mantenimiento" numeric(15,2) NOT NULL DEFAULT 50,
  "servicios" varchar(255) NOT NULL DEFAULT 'Agua, luz',
  "activo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "departments_codigo_idx" ON "departments" USING btree ("codigo");
CREATE INDEX "departments_persona_pago_idx" ON "departments" USING btree ("persona_pago");
CREATE INDEX "departments_piso_idx" ON "departments" USING btree ("piso");
