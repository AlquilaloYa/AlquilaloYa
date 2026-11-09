ALTER TABLE public.local_contacts
  ADD COLUMN tipo_persona varchar(10) NOT NULL DEFAULT 'NATURAL'
    CHECK (tipo_persona IN ('NATURAL', 'LEGAL')),
  ADD COLUMN ruc varchar(20) NOT NULL DEFAULT '',
  ADD COLUMN codigo_pais varchar(6) NOT NULL DEFAULT '51',
  ADD COLUMN domicilio varchar(500) NOT NULL DEFAULT '',
  ADD COLUMN nacionalidad varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN contacto_emergencia_nombre varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN contacto_emergencia_parentesco varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN contacto_emergencia_telefono varchar(30) NOT NULL DEFAULT '',
  ADD COLUMN mascotas boolean NOT NULL DEFAULT false,
  ADD COLUMN mascotas_items text NOT NULL DEFAULT '';
