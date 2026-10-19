-- Bloquea el departamento 3 de Angamos (ANG170-3) en disponibilidad.
--
-- estado_manual = 'BLOQUEADO' hace que la unidad aparezca como bloqueada en
-- /disponibilidad y no se ofrezca como disponible, con independencia de si
-- tiene o no contrato vigente.

UPDATE departments
SET estado_manual = 'BLOQUEADO'
WHERE codigo = 'ANG170-3';
