ALTER TABLE public.local_separations
  ADD COLUMN tipo varchar(20) NOT NULL DEFAULT '500',
  ADD COLUMN garantia_extendida boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT local_separations_tipo_check
    CHECK (tipo IN ('500', 'TOTAL', 'FLUCTUANTE'));

ALTER TABLE public.local_contracts
  ADD COLUMN plantilla_version_id uuid REFERENCES public.template_versions(id),
  ADD COLUMN deposito_garantia numeric(15, 2) NOT NULL DEFAULT 0
    CHECK (deposito_garantia >= 0),
  ADD COLUMN mantenimiento numeric(15, 2) NOT NULL DEFAULT 0
    CHECK (mantenimiento >= 0),
  ADD COLUMN documento_html text;

ALTER TABLE public.local_contracts
  DROP CONSTRAINT local_contracts_estado_check,
  ADD CONSTRAINT local_contracts_estado_check
    CHECK (estado IN ('BORRADOR', 'EMITIDO', 'NOTARIADO_FIRMADO', 'VIGENTE', 'FINALIZADO', 'ANULADO'));

ALTER TABLE public.local_annexes
  ADD COLUMN tipo varchar(30) NOT NULL DEFAULT 'ADENDA'
    CHECK (tipo IN ('ADENDA', 'ADENDA_EXTENSION')),
  ADD COLUMN fecha_fin date,
  ADD COLUMN monto_canon numeric(15, 2)
    CHECK (monto_canon IS NULL OR monto_canon >= 0),
  ADD COLUMN documento_html text;

ALTER TABLE public.local_annexes
  DROP CONSTRAINT local_annexes_estado_check,
  ADD CONSTRAINT local_annexes_estado_check
    CHECK (estado IN ('BORRADOR', 'EMITIDA', 'NOTARIADA_FIRMADA', 'VIGENTE', 'ANULADA'));

CREATE TABLE public.local_contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  separation_id uuid REFERENCES public.local_separations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.local_contracts(id) ON DELETE CASCADE,
  annex_id uuid REFERENCES public.local_annexes(id) ON DELETE CASCADE,
  tipo varchar(32) NOT NULL
    CHECK (tipo IN ('VOUCHER_SEPARACION', 'VOUCHER_GARANTIA', 'VOUCHER_PRIMERA_MENSUALIDAD', 'CONTRATO_EMITIDO', 'CONTRATO_FIRMADO', 'ADENDA_EMITIDA', 'ADENDA_FIRMADA')),
  nombre varchar(255) NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL
    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 12582912),
  uploaded_by varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_contract_documents_parent_check
    CHECK (num_nonnulls(separation_id, contract_id, annex_id) = 1)
);
CREATE INDEX local_contract_documents_local_id_created_idx
  ON public.local_contract_documents (local_id, created_at);
CREATE INDEX local_contract_documents_separation_idx
  ON public.local_contract_documents (separation_id, tipo);
CREATE INDEX local_contract_documents_contract_idx
  ON public.local_contract_documents (contract_id, tipo);
CREATE INDEX local_contract_documents_annex_idx
  ON public.local_contract_documents (annex_id, tipo);

CREATE TABLE public.local_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id uuid NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.local_contracts(id) ON DELETE CASCADE,
  periodo date NOT NULL,
  monto numeric(15, 2) NOT NULL DEFAULT 0,
  mantenimiento numeric(15, 2) NOT NULL DEFAULT 0,
  penalidad numeric(15, 2) NOT NULL DEFAULT 0,
  monto_pagado numeric(15, 2) NOT NULL DEFAULT 0,
  dias_indulgencia integer NOT NULL DEFAULT 0,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADO')),
  fecha_pago date,
  voucher_verificado_en timestamptz,
  voucher_verificado_por varchar(255),
  vouchers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_payments_contract_periodo_key UNIQUE (contract_id, periodo)
);
CREATE INDEX local_payments_local_periodo_idx
  ON public.local_payments (local_id, periodo);
CREATE INDEX local_payments_estado_periodo_idx
  ON public.local_payments (local_id, estado, periodo);
