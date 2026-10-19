-- Documento HTML editable del contrato.
--
-- Permite editar dentro del ERP el HTML con el que se genera el PDF del
-- contrato (añadir texto, puntos/cláusulas manuales, ajustar redacción).
--
-- - `contracts.documento_html`: override del borrador (NULL = usar la plantilla).
-- - `contract_snapshots.documento_html`: copia congelada del HTML al emitir.
--   Al editar un contrato ya emitido se crea un NUEVO snapshot (nueva versión)
--   con el HTML modificado; los snapshots anteriores permanecen como historial.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS documento_html text;
ALTER TABLE public.contract_snapshots ADD COLUMN IF NOT EXISTS documento_html text;
