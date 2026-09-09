ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS separacion_detalle jsonb;

ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS copia_dni jsonb NOT NULL DEFAULT '[]'::jsonb;