-- 0025: payments - unica (contract_id, periodo) para upsert idempotente
-- Nota: la reestructuracion (0007) borro "payments" y nunca recreo el
-- constraint unico que exige INSERT ... ON CONFLICT (contract_id, periodo).
create unique index if not exists payments_contract_periodo_key
  on public.payments (contract_id, periodo);