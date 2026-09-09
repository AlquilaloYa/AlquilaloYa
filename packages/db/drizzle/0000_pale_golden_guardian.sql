CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERADOR', 'SUPERVISOR', 'AUDITOR', 'FIRMANTE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombres" varchar(255) NOT NULL,
	"apellidos" varchar(255),
	"documento_identidad" varchar(50) NOT NULL,
	"ruc" varchar(11),
	"tipo_persona" varchar(20) NOT NULL,
	"email" varchar(255),
	"telefono" varchar(30),
	"codigo_departamento" varchar(50),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_documento_identidad_unique" UNIQUE("documento_identidad")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(50) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"direccion" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" varchar(255) NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role" "user_role" NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_permission_id_unique" UNIQUE("role","permission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'OPERADOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "template_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"departamento_id" uuid NOT NULL,
	CONSTRAINT "template_departments_template_departamento_unique" UNIQUE("template_id","departamento_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" boolean DEFAULT false NOT NULL,
	"publicado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_template_id_version_unique" UNIQUE("template_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" varchar(30) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clause_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clause_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" varchar(30) DEFAULT 'BORRADOR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clause_versions_clause_id_version_unique" UNIQUE("clause_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" varchar(50) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clauses_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"clause_version_id" uuid NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contract_clauses_contrato_clause_unique" UNIQUE("contrato_id","clause_version_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annex_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annex_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" boolean DEFAULT false NOT NULL,
	"publicado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annex_versions_annex_id_version_unique" UNIQUE("annex_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departamento_id" uuid NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_annexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"annex_version_id" uuid NOT NULL,
	CONSTRAINT "contract_annexes_contrato_annex_unique" UNIQUE("contrato_id","annex_version_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_contrato" varchar(50) NOT NULL,
	"plantilla_version_id" uuid NOT NULL,
	"datos_cliente" jsonb NOT NULL,
	"datos_departamento" jsonb NOT NULL,
	"datos_contrato" jsonb NOT NULL,
	"clausulas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anexos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inmutable" boolean DEFAULT false NOT NULL,
	"emitido_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
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
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_contrato" varchar(50) NOT NULL,
	"cliente_id" uuid NOT NULL,
	"departamento_id" uuid NOT NULL,
	"plantilla_version_id" uuid NOT NULL,
	"monto_canon_mensual" numeric(15, 2) NOT NULL,
	"deposito_garantia" numeric(15, 2) DEFAULT '0' NOT NULL,
	"mantenimiento" numeric(15, 2) DEFAULT '0' NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" varchar(30) DEFAULT 'BORRADOR' NOT NULL,
	"snapshot_id" uuid,
	"renovado_de" uuid,
	"separacion" boolean DEFAULT true NOT NULL,
	"muebleria_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"motivo_resolucion" varchar(500),
	"resuelto_en" timestamp with time zone,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_codigo_contrato_unique" UNIQUE("codigo_contrato")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"monto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"mantenimiento" numeric(15, 2) DEFAULT '50' NOT NULL,
	"penalidad" numeric(15, 2) DEFAULT '0' NOT NULL,
	"estado" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"fecha_pago" date,
	"voucher_nombre" varchar(255),
	"voucher_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_contract_periodo_key" UNIQUE("contract_id","periodo")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"auth_type" varchar(30) NOT NULL,
	"encrypted" text NOT NULL,
	"fingerprint" varchar(64),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_departments" ADD CONSTRAINT "template_departments_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_departments" ADD CONSTRAINT "template_departments_departamento_id_departments_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clause_versions" ADD CONSTRAINT "clause_versions_clause_id_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."clauses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_clauses" ADD CONSTRAINT "contract_clauses_contrato_id_contracts_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_clauses" ADD CONSTRAINT "contract_clauses_clause_version_id_clause_versions_id_fk" FOREIGN KEY ("clause_version_id") REFERENCES "public"."clause_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annex_versions" ADD CONSTRAINT "annex_versions_annex_id_annexes_id_fk" FOREIGN KEY ("annex_id") REFERENCES "public"."annexes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annexes" ADD CONSTRAINT "annexes_departamento_id_departments_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_annexes" ADD CONSTRAINT "contract_annexes_contrato_id_contracts_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_annexes" ADD CONSTRAINT "contract_annexes_annex_version_id_annex_versions_id_fk" FOREIGN KEY ("annex_version_id") REFERENCES "public"."annex_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_snapshots" ADD CONSTRAINT "contract_snapshots_plantilla_version_id_template_versions_id_fk" FOREIGN KEY ("plantilla_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_snapshot_id_contract_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."contract_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cliente_id_clients_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_departamento_id_departments_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plantilla_version_id_template_versions_id_fk" FOREIGN KEY ("plantilla_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_snapshot_id_contract_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."contract_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_connector_id_connector_instances_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector_instances"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_versions_template_idx" ON "template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clause_versions_clause_idx" ON "clause_versions" USING btree ("clause_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_clauses_contrato_idx" ON "contract_clauses" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annex_versions_annex_idx" ON "annex_versions" USING btree ("annex_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_annexes_contrato_idx" ON "contract_annexes" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_snapshots_codigo_idx" ON "contract_snapshots" USING btree ("codigo_contrato");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_contract_idx" ON "documents" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_snapshot_idx" ON "documents" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_cliente_idx" ON "contracts" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_departamento_idx" ON "contracts" USING btree ("departamento_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_estado_idx" ON "contracts" USING btree ("estado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_renovado_de_idx" ON "contracts" USING btree ("renovado_de");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_contract_idx" ON "payments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_credentials_connector_idx" ON "connector_credentials" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_instances_type_idx" ON "connector_instances" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_instances_provider_idx" ON "connector_instances" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_logs_connector_idx" ON "connector_logs" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_logs_created_idx" ON "connector_logs" USING btree ("created_at");