-- Fase 3 (cambio menor): dividir el nombre completo del cliente en nombres y apellidos.
-- El valor existente de "nombre_completo" se conserva en "nombres"; "apellidos" queda NULL.

ALTER TABLE "clients" RENAME COLUMN "nombre_completo" TO "nombres";
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "apellidos" varchar(255);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "ruc" varchar(11);