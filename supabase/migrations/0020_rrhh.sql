-- 0020: expedientes de personal (Recursos Humanos)
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  nombres varchar(255) not null,
  apellidos varchar(255) not null default '',
  dni varchar(30) not null default '',
  email varchar(255) not null default '',
  telefono varchar(40) not null default '',
  cargo varchar(255) not null default '',
  area varchar(120) not null default '',
  fecha_ingreso timestamptz,
  estado varchar(30) not null default 'ACTIVO',
  direccion text not null default '',
  notas text not null default '',
  documentos jsonb not null default '[]'::jsonb,
  creado_por varchar(255) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_employees_dni_idx on public.hr_employees (dni);
create index if not exists hr_employees_estado_idx on public.hr_employees (estado);