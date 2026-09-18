-- Permite adjuntar uno o varios vouchers por pago (antes solo uno).
ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "vouchers" jsonb NOT NULL DEFAULT '[]'::jsonb;