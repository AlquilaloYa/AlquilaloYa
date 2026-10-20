-- Contabilidad: ajustes manuales para los estados financieros.
--
-- El ERP deriva los ingresos (pagos de cobranza), egresos (materiales de
-- órdenes de trabajo) y el flujo de caja. Esta tabla permite cargar a mano las
-- líneas que el sistema no conoce (sueldos, servicios, activos, pasivos, etc.)
-- para completar el Balance General, el Estado de Resultados y el Estado de
-- Flujo de Efectivo, mes a mes.

CREATE TABLE IF NOT EXISTS public.accounting_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo date NOT NULL,
  estado varchar(20) NOT NULL,
  grupo varchar(20) NOT NULL,
  etiqueta varchar(255) NOT NULL,
  monto numeric(15, 2) NOT NULL DEFAULT '0',
  nota text NOT NULL DEFAULT '',
  creado_por varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounting_entries_periodo_idx
  ON public.accounting_entries (periodo);

CREATE INDEX IF NOT EXISTS accounting_entries_estado_idx
  ON public.accounting_entries (periodo, estado);
