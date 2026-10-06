CREATE TABLE IF NOT EXISTS "hr_organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" varchar(255) NOT NULL UNIQUE,
  "ruc" varchar(20) NOT NULL DEFAULT '',
  "activa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "hr_sites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "hr_organizations"("id"),
  "nombre" varchar(160) NOT NULL,
  "direccion" text NOT NULL DEFAULT '',
  "activa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "hr_sites_org_name_key" UNIQUE("organization_id", "nombre")
);
CREATE INDEX IF NOT EXISTS "hr_sites_organization_idx" ON "hr_sites" ("organization_id");

CREATE TABLE IF NOT EXISTS "hr_departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "hr_organizations"("id"),
  "nombre" varchar(160) NOT NULL,
  "activa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "hr_departments_org_name_key" UNIQUE("organization_id", "nombre")
);
CREATE INDEX IF NOT EXISTS "hr_departments_organization_idx" ON "hr_departments" ("organization_id");

CREATE TABLE IF NOT EXISTS "hr_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid NOT NULL REFERENCES "hr_departments"("id"),
  "nombre" varchar(160) NOT NULL,
  "activa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "hr_teams_department_name_key" UNIQUE("department_id", "nombre")
);
CREATE INDEX IF NOT EXISTS "hr_teams_department_idx" ON "hr_teams" ("department_id");

CREATE TABLE IF NOT EXISTS "hr_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "hr_organizations"("id"),
  "nombre" varchar(160) NOT NULL,
  "activa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "hr_positions_org_name_key" UNIQUE("organization_id", "nombre")
);
CREATE INDEX IF NOT EXISTS "hr_positions_organization_idx" ON "hr_positions" ("organization_id");

ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "hr_organizations"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "hr_sites"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "hr_departments"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "hr_teams"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "position_id" uuid REFERENCES "hr_positions"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "manager_id" uuid REFERENCES "hr_employees"("id");
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "onboarding_stage" varchar(40) NOT NULL DEFAULT 'REGISTRO';
CREATE INDEX IF NOT EXISTS "hr_employees_department_idx" ON "hr_employees" ("department_id");
CREATE INDEX IF NOT EXISTS "hr_employees_team_idx" ON "hr_employees" ("team_id");
CREATE INDEX IF NOT EXISTS "hr_employees_manager_idx" ON "hr_employees" ("manager_id");

INSERT INTO "hr_organizations" ("nombre") VALUES ('Organización principal') ON CONFLICT ("nombre") DO NOTHING;
INSERT INTO "hr_sites" ("organization_id", "nombre")
SELECT o."id", trim(e."sede") FROM "hr_employees" e CROSS JOIN "hr_organizations" o
WHERE o."nombre" = 'Organización principal' AND trim(e."sede") <> ''
ON CONFLICT ("organization_id", "nombre") DO NOTHING;
INSERT INTO "hr_departments" ("organization_id", "nombre")
SELECT o."id", trim(e."area") FROM "hr_employees" e CROSS JOIN "hr_organizations" o
WHERE o."nombre" = 'Organización principal' AND trim(e."area") <> ''
ON CONFLICT ("organization_id", "nombre") DO NOTHING;
INSERT INTO "hr_teams" ("department_id", "nombre")
SELECT d."id", trim(e."equipo") FROM "hr_employees" e
JOIN "hr_organizations" o ON o."nombre" = 'Organización principal'
JOIN "hr_departments" d ON d."organization_id" = o."id" AND d."nombre" = trim(e."area")
WHERE trim(e."equipo") <> ''
ON CONFLICT ("department_id", "nombre") DO NOTHING;
INSERT INTO "hr_positions" ("organization_id", "nombre")
SELECT o."id", trim(e."cargo") FROM "hr_employees" e CROSS JOIN "hr_organizations" o
WHERE o."nombre" = 'Organización principal' AND trim(e."cargo") <> ''
ON CONFLICT ("organization_id", "nombre") DO NOTHING;

UPDATE "hr_employees" e SET "organization_id" = o."id"
FROM "hr_organizations" o WHERE o."nombre" = 'Organización principal' AND e."organization_id" IS NULL;
UPDATE "hr_employees" e SET "site_id" = s."id" FROM "hr_sites" s
WHERE s."organization_id" = e."organization_id" AND s."nombre" = trim(e."sede") AND e."site_id" IS NULL AND trim(e."sede") <> '';
UPDATE "hr_employees" e SET "department_id" = d."id" FROM "hr_departments" d
WHERE d."organization_id" = e."organization_id" AND d."nombre" = trim(e."area") AND e."department_id" IS NULL AND trim(e."area") <> '';
UPDATE "hr_employees" e SET "team_id" = t."id" FROM "hr_teams" t
WHERE t."department_id" = e."department_id" AND t."nombre" = trim(e."equipo") AND e."team_id" IS NULL AND trim(e."equipo") <> '';
UPDATE "hr_employees" e SET "position_id" = p."id" FROM "hr_positions" p
WHERE p."organization_id" = e."organization_id" AND p."nombre" = trim(e."cargo") AND e."position_id" IS NULL AND trim(e."cargo") <> '';

CREATE TABLE IF NOT EXISTS "hr_employments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "hr_employees"("id"),
  "tipo_contrato" varchar(80) NOT NULL DEFAULT 'INDEFINIDO',
  "numero_contrato" varchar(120) NOT NULL DEFAULT '',
  "fecha_inicio" timestamptz NOT NULL,
  "fecha_fin" timestamptz,
  "estado" varchar(30) NOT NULL DEFAULT 'ACTIVO',
  "salario" varchar(40) NOT NULL DEFAULT '',
  "renovacion_de_id" uuid,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_employments_employee_start_idx" ON "hr_employments" ("employee_id", "fecha_inicio");
CREATE INDEX IF NOT EXISTS "hr_employments_end_idx" ON "hr_employments" ("fecha_fin");
INSERT INTO "hr_employments" ("employee_id", "fecha_inicio", "estado", "created_by")
SELECT e."id", coalesce(e."fecha_ingreso", e."created_at"), e."estado", e."creado_por"
FROM "hr_employees" e WHERE NOT EXISTS (SELECT 1 FROM "hr_employments" j WHERE j."employee_id" = e."id");

CREATE TABLE IF NOT EXISTS "hr_employee_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "hr_employees"("id"),
  "employment_id" uuid REFERENCES "hr_employments"("id"),
  "tipo" varchar(60) NOT NULL,
  "nombre" varchar(255) NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "storage_key" text NOT NULL,
  "mime_type" varchar(120) NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "estado" varchar(30) NOT NULL DEFAULT 'VIGENTE',
  "fecha_documento" timestamptz,
  "vence_en" timestamptz,
  "uploaded_by" varchar(255) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_employee_documents_employee_idx" ON "hr_employee_documents" ("employee_id", "created_at");
CREATE INDEX IF NOT EXISTS "hr_employee_documents_expiry_idx" ON "hr_employee_documents" ("vence_en");

CREATE TABLE IF NOT EXISTS "hr_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "hr_employees"("id"),
  "tipo" varchar(30) NOT NULL,
  "fecha_inicio" timestamptz NOT NULL,
  "fecha_fin" timestamptz NOT NULL,
  "motivo" text NOT NULL,
  "estado" varchar(30) NOT NULL DEFAULT 'PENDIENTE',
  "aprobado_por" varchar(255),
  "respondido_en" timestamptz,
  "respuesta" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_requests_employee_idx" ON "hr_requests" ("employee_id", "created_at");
CREATE INDEX IF NOT EXISTS "hr_requests_status_idx" ON "hr_requests" ("estado", "tipo");