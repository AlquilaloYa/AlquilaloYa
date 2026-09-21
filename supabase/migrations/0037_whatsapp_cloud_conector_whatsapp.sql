-- 0037: whatsapp-cloud como conector WHATSAPP (adaptador nativo).
-- El adaptador WHATSAPP resuelve el token desde las credenciales cifradas.
UPDATE connector_instances
SET type = 'WHATSAPP',
    config = '{"phoneNumberId":"","apiVersion":"v20.0"}'::jsonb
WHERE provider = 'whatsapp-cloud' AND type = 'REST';