-- El código de país del teléfono del contacto pasa a ser variable (por defecto Perú +51).
ALTER TABLE "contacts"
ADD COLUMN IF NOT EXISTS "codigo_pais" varchar(10) NOT NULL DEFAULT '51';