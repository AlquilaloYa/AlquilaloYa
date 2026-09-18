-- Período de indulgencia: días de prórroga que se le otorgan a un cliente para
-- pagar la mensualidad. Es variable y se ingresa manualmente en Cobranza.
ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "dias_indulgencia" integer NOT NULL DEFAULT 0;