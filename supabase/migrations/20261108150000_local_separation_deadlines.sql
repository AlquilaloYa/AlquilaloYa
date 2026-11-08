ALTER TABLE public.local_separations
  ADD COLUMN dias_tiempo integer NOT NULL DEFAULT 1
    CHECK (dias_tiempo >= 1),
  ADD COLUMN fecha_limite_manual timestamptz,
  ADD COLUMN fecha_garantia_extendida timestamptz;

ALTER TABLE public.local_contract_documents
  DROP CONSTRAINT local_contract_documents_tipo_check,
  ADD CONSTRAINT local_contract_documents_tipo_check
    CHECK (tipo IN (
      'VOUCHER_SEPARACION',
      'VOUCHER_GARANTIA_EXTENDIDA',
      'VOUCHER_GARANTIA',
      'VOUCHER_PRIMERA_MENSUALIDAD',
      'CONTRATO_EMITIDO',
      'CONTRATO_FIRMADO',
      'ADENDA_EMITIDA',
      'ADENDA_FIRMADA'
    ));
