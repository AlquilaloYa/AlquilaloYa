CREATE TABLE client_payment_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,
  servicios_extras_pago_id uuid REFERENCES servicios_extras_pagos(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  requested_amount numeric(15, 2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_payment_approval_target_check
    CHECK ((payment_id IS NOT NULL) <> (servicios_extras_pago_id IS NOT NULL)),
  CONSTRAINT client_payment_approval_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'USED')),
  CONSTRAINT client_payment_approval_amount_positive
    CHECK (requested_amount > 0)
);

CREATE UNIQUE INDEX client_payment_approval_payment_open_unique
  ON client_payment_approval_requests(payment_id)
  WHERE payment_id IS NOT NULL AND status IN ('PENDING', 'APPROVED');
CREATE UNIQUE INDEX client_payment_approval_service_open_unique
  ON client_payment_approval_requests(servicios_extras_pago_id)
  WHERE servicios_extras_pago_id IS NOT NULL AND status IN ('PENDING', 'APPROVED');
CREATE INDEX client_payment_approval_client_created_idx
  ON client_payment_approval_requests(client_id, created_at DESC);
CREATE INDEX client_payment_approval_status_created_idx
  ON client_payment_approval_requests(status, created_at DESC);

ALTER TABLE client_portal_notifications
  ALTER COLUMN work_order_id DROP NOT NULL;
ALTER TABLE client_portal_notifications
  DROP CONSTRAINT client_portal_notifications_type_check;
ALTER TABLE client_portal_notifications
  ADD CONSTRAINT client_portal_notifications_type_check
  CHECK (type IN (
    'REQUEST_CONVERTED',
    'VISIT_CONFIRMED',
    'PAYMENT_DUE',
    'PAYMENT_APPROVAL_REQUESTED',
    'PAYMENT_APPROVAL_APPROVED',
    'PAYMENT_APPROVAL_REJECTED',
    'PAYMENT_VOUCHER_UPLOADED'
  ));
