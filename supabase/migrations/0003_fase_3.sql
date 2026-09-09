--> statement-breakpoint
-- Fase 3: Núcleo contractual (contratos, plantillas, cláusulas, anexos, snapshots)
--> statement-breakpoint
-- Plantillas y versiones de plantilla
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
CREATE TABLE IF NOT EXISTS "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL REFERENCES "templates"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" boolean DEFAULT false NOT NULL,
	"publicado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_template_id_version_unique" UNIQUE("template_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_versions_template_idx" ON "template_versions" USING btree ("template_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL REFERENCES "templates"("id") ON DELETE cascade,
	"departamento_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE cascade,
	CONSTRAINT "template_departments_template_departamento_unique" UNIQUE("template_id", "departamento_id")
);
--> statement-breakpoint
-- Cláusulas y versiones de cláusula
CREATE TABLE IF NOT EXISTS "clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" varchar(50) NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clauses_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clause_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clause_id" uuid NOT NULL REFERENCES "clauses"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" varchar(30) DEFAULT 'BORRADOR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clause_versions_clause_id_version_unique" UNIQUE("clause_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clause_versions_clause_idx" ON "clause_versions" USING btree ("clause_id");
--> statement-breakpoint
-- Anexos y versiones de anexo (activos por departamento)
CREATE TABLE IF NOT EXISTS "annexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departamento_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE cascade,
	"nombre" varchar(255) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annexes_departamento_idx" ON "annexes" USING btree ("departamento_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annex_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annex_id" uuid NOT NULL REFERENCES "annexes"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada" boolean DEFAULT false NOT NULL,
	"publicado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annex_versions_annex_id_version_unique" UNIQUE("annex_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annex_versions_annex_idx" ON "annex_versions" USING btree ("annex_id");
--> statement-breakpoint
-- Snapshots (congelan datos al emitir)
CREATE TABLE IF NOT EXISTS "contract_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_contrato" varchar(50) NOT NULL,
	"plantilla_version_id" uuid NOT NULL REFERENCES "template_versions"("id"),
	"datos_cliente" jsonb NOT NULL,
	"datos_departamento" jsonb NOT NULL,
	"datos_contrato" jsonb NOT NULL,
	"clausulas" jsonb DEFAULT '[]' NOT NULL,
	"anexos" jsonb DEFAULT '[]' NOT NULL,
	"inmutable" boolean DEFAULT false NOT NULL,
	"emitido_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_snapshots_codigo_idx" ON "contract_snapshots" USING btree ("codigo_contrato");
--> statement-breakpoint
-- Contrato: reestructurar a la forma contractual de Fase 3
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "numero";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "tipo_template";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "modalidad";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "monto";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "garantia";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "documento_id";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "hash_documento";
--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "created_at";
--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
ALTER TABLE "contracts" RENAME COLUMN "cliente_id" TO "cliente_id";
--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "fecha_inicio" TYPE date USING ("fecha_inicio"::date);
--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "fecha_fin" TYPE date USING ("fecha_fin"::date);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "codigo_contrato" varchar(50) NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "plantilla_version_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "monto_canon_mensual" numeric(15,2) NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "deposito_garantia" numeric(15,2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "snapshot_id" uuid REFERENCES "contract_snapshots"("id");
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "creado_por" uuid;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_codigo_contrato_unique" UNIQUE("codigo_contrato");
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plantilla_version_id_contracts_id_fk" FOREIGN KEY ("plantilla_version_id") REFERENCES "template_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_snapshot_id_contract_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "contract_snapshots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_departamento_idx" ON "contracts" USING btree ("departamento_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_estado_idx" ON "contracts" USING btree ("estado");
--> statement-breakpoint
-- Vínculos por contrato: cláusulas y anexos congelados
CREATE TABLE IF NOT EXISTS "contract_clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE cascade,
	"clause_version_id" uuid NOT NULL REFERENCES "clause_versions"("id"),
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contract_clauses_contrato_clause_unique" UNIQUE("contrato_id", "clause_version_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_clauses_contrato_idx" ON "contract_clauses" USING btree ("contrato_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_annexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE cascade,
	"annex_version_id" uuid NOT NULL REFERENCES "annex_versions"("id"),
	CONSTRAINT "contract_annexes_contrato_annex_unique" UNIQUE("contrato_id", "annex_version_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_annexes_contrato_idx" ON "contract_annexes" USING btree ("contrato_id");