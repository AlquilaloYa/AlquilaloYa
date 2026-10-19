-- Cambia la persona de pago de todo el edificio Angamos a Miguel.
--
-- Contexto de negocio: a partir de ahora todos los contratos y adendas de
-- Angamos deben salir a nombre de Miguel (y todos los de Benavides a nombre de
-- Emely, que ya están así). Como el arrendador, la cuenta bancaria, la cobranza
-- y las analíticas se derivan del campo departments.persona_pago, basta con
-- actualizar este campo para el edificio Angamos.
--
-- IMPORTANTE:
--   * NO se regenera ningún documento existente.
--   * Los snapshots ya emitidos conservan su persona_pago original (inmutables);
--     este cambio aplica solo a lo que se emita/calcule a partir de ahora.
--   * Benavides ya tiene persona_pago = 'Emely' (sin cambios).

UPDATE departments
SET persona_pago = 'Miguel'
WHERE UPPER(codigo) LIKE 'ANG%';
