ALTER TABLE public.locales
  ADD COLUMN pago_agua_porcentaje numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN monto_jardineria numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN impuesto_renta_porcentaje numeric(5, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN letrero_alto_cm numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN letrero_ancho_cm numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN letrero_profundidad_cm numeric(10, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT locales_pago_agua_porcentaje_check
    CHECK (pago_agua_porcentaje BETWEEN 0 AND 100),
  ADD CONSTRAINT locales_impuesto_renta_porcentaje_check
    CHECK (impuesto_renta_porcentaje BETWEEN 0 AND 100),
  ADD CONSTRAINT locales_monto_jardineria_check
    CHECK (monto_jardineria >= 0),
  ADD CONSTRAINT locales_letrero_alto_cm_check
    CHECK (letrero_alto_cm >= 0),
  ADD CONSTRAINT locales_letrero_ancho_cm_check
    CHECK (letrero_ancho_cm >= 0),
  ADD CONSTRAINT locales_letrero_profundidad_cm_check
    CHECK (letrero_profundidad_cm >= 0);

ALTER TABLE public.local_files
  ADD COLUMN categoria varchar(40) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE public.local_files
  DROP CONSTRAINT IF EXISTS local_files_size_bytes_check,
  DROP CONSTRAINT IF EXISTS local_files_mime_size_check,
  ADD CONSTRAINT local_files_categoria_check
    CHECK (categoria IN ('GENERAL', 'ESPECIFICACIONES_TECNICAS')),
  ADD CONSTRAINT local_files_size_bytes_check
    CHECK (size_bytes > 0 AND size_bytes <= 12582912),
  ADD CONSTRAINT local_files_mime_size_check
    CHECK (
      (mime_type = 'application/pdf' AND size_bytes <= 8388608)
      OR (mime_type IN ('image/jpeg', 'image/png', 'image/webp') AND size_bytes <= 12582912)
    );

UPDATE storage.buckets
SET file_size_limit = 12582912,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'local-assets';

ALTER TABLE public.local_separations
  DROP CONSTRAINT IF EXISTS local_separations_tipo_check,
  ADD CONSTRAINT local_separations_tipo_check
    CHECK (tipo IN ('500', 'TOTAL', 'GARANTIA', 'FLUCTUANTE'));

ALTER TABLE public.local_payments
  ADD COLUMN recibo_luz_monto numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN recibo_agua_monto numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN pago_luz_porcentaje numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN pago_agua_porcentaje numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN pago_luz numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN pago_agua numeric(15, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT local_payments_recibos_monto_check
    CHECK (recibo_luz_monto >= 0 AND recibo_agua_monto >= 0),
  ADD CONSTRAINT local_payments_recibos_porcentaje_check
    CHECK (
      pago_luz_porcentaje BETWEEN 0 AND 100
      AND pago_agua_porcentaje BETWEEN 0 AND 100
    ),
  ADD CONSTRAINT local_payments_servicios_monto_check
    CHECK (pago_luz >= 0 AND pago_agua >= 0);