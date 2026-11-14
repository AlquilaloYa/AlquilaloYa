CREATE TABLE client_contract_renewal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  note text,
  status varchar(20) DEFAULT 'PENDING' NOT NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT client_contract_renewal_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX client_contract_renewal_open_unique
  ON client_contract_renewal_requests(contract_id, client_id)
  WHERE status = 'PENDING';

CREATE INDEX client_contract_renewal_contract_created_idx
  ON client_contract_renewal_requests(contract_id, created_at DESC);

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
    'PAYMENT_VOUCHER_UPLOADED',
    'CONTRACT_RENEWAL_REQUESTED'
  ));
