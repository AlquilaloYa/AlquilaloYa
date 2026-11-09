DROP INDEX IF EXISTS public.local_contracts_local_id_idx;
DROP INDEX IF EXISTS public.local_contracts_local_id_key;
ALTER TABLE public.local_contracts
  DROP CONSTRAINT IF EXISTS local_contracts_codigo_key;

CREATE UNIQUE INDEX local_contracts_reserved_local_key
  ON public.local_contracts (local_id)
  WHERE estado IN ('BORRADOR', 'EMITIDO', 'NOTARIADO_FIRMADO', 'VIGENTE');

CREATE INDEX local_contracts_codigo_idx
  ON public.local_contracts (codigo);
