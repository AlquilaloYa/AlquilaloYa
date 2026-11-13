-- Verificación del voucher de servicios extras (flujo con MFA, igual que pagos).
ALTER TABLE servicios_extras
  ADD COLUMN IF NOT EXISTS voucher_verificado_en timestamptz,
  ADD COLUMN IF NOT EXISTS voucher_verificado_por varchar(100);
