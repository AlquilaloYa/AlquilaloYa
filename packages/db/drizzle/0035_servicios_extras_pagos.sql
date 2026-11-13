-- Pagos mensuales de servicios extras: un voucher por mes por servicio.
CREATE TABLE IF NOT EXISTS servicios_extras_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES servicios_extras(id) ON DELETE CASCADE,
  periodo varchar(7) NOT NULL,
  fecha_vencimiento date NOT NULL,
  voucher_filename varchar(255),
  voucher_storage_key text,
  voucher_mime_type varchar(100),
  voucher_size_bytes numeric(15, 0),
  voucher_sha256 varchar(64),
  voucher_verificado_en timestamptz,
  voucher_verificado_por varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT servicios_extras_pagos_servicio_periodo_key UNIQUE (servicio_id, periodo)
);
CREATE INDEX IF NOT EXISTS servicios_extras_pagos_servicio_idx ON servicios_extras_pagos(servicio_id);
CREATE INDEX IF NOT EXISTS servicios_extras_pagos_vencimiento_idx ON servicios_extras_pagos(fecha_vencimiento);

-- Backfill: el voucher ya existente del registro pasa a ser el pago de su mes.
INSERT INTO servicios_extras_pagos (
  servicio_id, periodo, fecha_vencimiento,
  voucher_filename, voucher_storage_key, voucher_mime_type,
  voucher_size_bytes, voucher_sha256,
  voucher_verificado_en, voucher_verificado_por
)
SELECT
  s.id,
  to_char(COALESCE(s.fecha_pago, s.fecha_opcion), 'YYYY-MM'),
  COALESCE(s.fecha_pago, s.fecha_opcion),
  s.voucher_filename, s.voucher_storage_key, s.voucher_mime_type,
  s.voucher_size_bytes, s.voucher_sha256,
  s.voucher_verificado_en, s.voucher_verificado_por
FROM servicios_extras s
WHERE s.voucher_storage_key IS NOT NULL
ON CONFLICT (servicio_id, periodo) DO NOTHING;
