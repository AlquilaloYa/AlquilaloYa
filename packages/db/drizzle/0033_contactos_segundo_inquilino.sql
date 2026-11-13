-- Segundo inquilino (co-arrendatario) en el contacto: nombre, DNI y nacionalidad.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS segundo_inquilino varchar(255),
  ADD COLUMN IF NOT EXISTS segundo_inquilino_dni varchar(30),
  ADD COLUMN IF NOT EXISTS segundo_inquilino_nacionalidad varchar(50);
