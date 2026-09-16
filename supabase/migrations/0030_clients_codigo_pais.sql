-- El código de país del teléfono del cliente pasa a ser variable (por defecto Perú +51).
ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "codigo_pais" varchar(10) NOT NULL DEFAULT '51';