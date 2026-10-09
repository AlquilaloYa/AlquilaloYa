-- Reduce los roles disponibles y reasigna las cuentas existentes antes de
-- reemplazar el enum para que los cuatro roles retirados no puedan volver a usarse.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE text USING "role"::text;
ALTER TABLE "role_permissions" ALTER COLUMN "role" TYPE text USING "role"::text;

UPDATE "users"
SET "role" = CASE "role"
	WHEN 'AUDITOR' THEN 'MARKETING'
	WHEN 'FIRMANTE' THEN 'ASISTENTE_ADMINISTRATIVO'
	WHEN 'OPERADOR' THEN 'ASISTENTE_ADMINISTRATIVO'
	WHEN 'SUPERVISOR' THEN 'ASISTENTE_ADMINISTRATIVO'
	ELSE "role"
END
WHERE "role" IN ('AUDITOR', 'FIRMANTE', 'OPERADOR', 'SUPERVISOR');

UPDATE "users"
SET "role" = 'DEVELOPER'
WHERE "email" = 'admin@sistema.com' AND "role" = 'ADMIN';

DELETE FROM "role_permissions"
WHERE "role" IN ('OPERADOR', 'SUPERVISOR', 'AUDITOR', 'FIRMANTE');

DROP TYPE "user_role";
CREATE TYPE "user_role" AS ENUM (
	'ADMIN',
	'DEVELOPER',
	'RRHH',
	'ASISTENTE_ADMINISTRATIVO',
	'MARKETING'
);

ALTER TABLE "users"
	ALTER COLUMN "role" TYPE "user_role" USING "role"::"user_role",
	ALTER COLUMN "role" SET DEFAULT 'RRHH';
ALTER TABLE "role_permissions"
	ALTER COLUMN "role" TYPE "user_role" USING "role"::"user_role";

CREATE UNIQUE INDEX IF NOT EXISTS "users_single_developer_idx"
	ON "users" ("role") WHERE "role" = 'DEVELOPER';
