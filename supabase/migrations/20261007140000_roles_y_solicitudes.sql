-- Reasigna los roles eliminados (Auditor, Firmante, Operador y Supervisor).
-- Developer por defecto: el admin principal (solo puede existir uno).
UPDATE "users" SET "role" = 'DEVELOPER' WHERE "email" = 'admin@sistema.com' AND "role" = 'ADMIN';
-- Auditor -> Marketing (solo lectura), Firmante -> Asistente Administrativo.
UPDATE "users" SET "role" = 'MARKETING' WHERE "role" = 'AUDITOR';
UPDATE "users" SET "role" = 'ASISTENTE_ADMINISTRATIVO' WHERE "role" = 'FIRMANTE';
UPDATE "users" SET "role" = 'ASISTENTE_ADMINISTRATIVO' WHERE "role" IN ('OPERADOR', 'SUPERVISOR');


