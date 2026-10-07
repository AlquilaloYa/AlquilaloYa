-- Borrado lógico en cascada desde un contacto.
--
-- Al eliminar un contacto se marca `eliminado_en` en todo lo generado a partir de
-- él: separación (uni/dep), cliente, contratos (pre-contrato y contrato final),
-- snapshots, documentos (PDFs y adendas) y pagos.
--
-- Es un borrado LÓGICO a propósito: /api/analiticas-cobranza y /api/dashboard
-- NO filtran esta columna, así que las estadísticas conservan al contacto. El
-- resto de pantallas sí la filtra y deja de mostrarlo.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.separations ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.contract_snapshots ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS eliminado_en timestamp with time zone;

CREATE INDEX IF NOT EXISTS contacts_eliminado_idx ON public.contacts (eliminado_en);
CREATE INDEX IF NOT EXISTS clients_eliminado_idx ON public.clients (eliminado_en);
CREATE INDEX IF NOT EXISTS contracts_eliminado_idx ON public.contracts (eliminado_en);
CREATE INDEX IF NOT EXISTS separations_eliminado_idx ON public.separations (eliminado_en);
