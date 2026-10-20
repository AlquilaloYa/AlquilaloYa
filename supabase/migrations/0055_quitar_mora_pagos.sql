-- Elimina la mora (penalidad) de todos los pagos registrados.
--
-- Contexto: todos los inquilinos pagaron a tiempo, pero el pago se registró
-- en el sistema después del vencimiento, por lo que la penalidad automática
-- de S/ 70 quedó mal aplicada. Se deja en cero para todas las cuotas.

UPDATE payments
SET penalidad = '0', updated_at = now()
WHERE penalidad IS NOT NULL AND penalidad <> '0';
