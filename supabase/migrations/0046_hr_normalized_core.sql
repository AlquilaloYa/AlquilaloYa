CREATE TABLE IF NOT EXISTS public.hr_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(255) NOT NULL UNIQUE,
  ruc varchar(20) NOT NULL DEFAULT '',
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  nombre varchar(160) NOT NULL,
  direccion text NOT NULL DEFAULT '',
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_sites_org_name_key UNIQUE (organization_id, nombre)
);
CREATE INDEX IF NOT EXISTS hr_sites_organization_idx ON public.hr_sites (organization_id);
CREATE TABLE IF NOT EXISTS public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  nombre varchar(160) NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_departments_org_name_key UNIQUE (organization_id, nombre)
);
CREATE INDEX IF NOT EXISTS hr_departments_organization_idx ON public.hr_departments (organization_id);
CREATE TABLE IF NOT EXISTS public.hr_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.hr_departments(id),
  nombre varchar(160) NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_teams_department_name_key UNIQUE (department_id, nombre)
);
CREATE INDEX IF NOT EXISTS hr_teams_department_idx ON public.hr_teams (department_id);
CREATE TABLE IF NOT EXISTS public.hr_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  nombre varchar(160) NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_positions_org_name_key UNIQUE (organization_id, nombre)
);
CREATE INDEX IF NOT EXISTS hr_positions_organization_idx ON public.hr_positions (organization_id);

ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.hr_organizations(id),
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.hr_sites(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.hr_departments(id),
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.hr_teams(id),
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.hr_positions(id),
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.hr_employees(id),
  ADD COLUMN IF NOT EXISTS onboarding_stage varchar(40) NOT NULL DEFAULT 'REGISTRO';
CREATE INDEX IF NOT EXISTS hr_employees_department_idx ON public.hr_employees (department_id);
CREATE INDEX IF NOT EXISTS hr_employees_team_idx ON public.hr_employees (team_id);
CREATE INDEX IF NOT EXISTS hr_employees_manager_idx ON public.hr_employees (manager_id);

INSERT INTO public.hr_organizations (nombre)
VALUES ('Organización principal')
ON CONFLICT (nombre) DO NOTHING;
INSERT INTO public.hr_sites (organization_id, nombre)
SELECT o.id, trim(e.sede) FROM public.hr_employees e CROSS JOIN public.hr_organizations o
WHERE o.nombre = 'Organización principal' AND trim(e.sede) <> ''
ON CONFLICT (organization_id, nombre) DO NOTHING;
INSERT INTO public.hr_departments (organization_id, nombre)
SELECT o.id, trim(e.area) FROM public.hr_employees e CROSS JOIN public.hr_organizations o
WHERE o.nombre = 'Organización principal' AND trim(e.area) <> ''
ON CONFLICT (organization_id, nombre) DO NOTHING;
INSERT INTO public.hr_teams (department_id, nombre)
SELECT d.id, trim(e.equipo) FROM public.hr_employees e
JOIN public.hr_organizations o ON o.nombre = 'Organización principal'
JOIN public.hr_departments d ON d.organization_id = o.id AND d.nombre = trim(e.area)
WHERE trim(e.equipo) <> ''
ON CONFLICT (department_id, nombre) DO NOTHING;
INSERT INTO public.hr_positions (organization_id, nombre)
SELECT o.id, trim(e.cargo) FROM public.hr_employees e CROSS JOIN public.hr_organizations o
WHERE o.nombre = 'Organización principal' AND trim(e.cargo) <> ''
ON CONFLICT (organization_id, nombre) DO NOTHING;

UPDATE public.hr_employees e SET organization_id = o.id
FROM public.hr_organizations o WHERE o.nombre = 'Organización principal' AND e.organization_id IS NULL;
UPDATE public.hr_employees e SET site_id = s.id FROM public.hr_sites s
WHERE s.organization_id = e.organization_id AND s.nombre = trim(e.sede) AND e.site_id IS NULL AND trim(e.sede) <> '';
UPDATE public.hr_employees e SET department_id = d.id FROM public.hr_departments d
WHERE d.organization_id = e.organization_id AND d.nombre = trim(e.area) AND e.department_id IS NULL AND trim(e.area) <> '';
UPDATE public.hr_employees e SET team_id = t.id FROM public.hr_teams t
WHERE t.department_id = e.department_id AND t.nombre = trim(e.equipo) AND e.team_id IS NULL AND trim(e.equipo) <> '';
UPDATE public.hr_employees e SET position_id = p.id FROM public.hr_positions p
WHERE p.organization_id = e.organization_id AND p.nombre = trim(e.cargo) AND e.position_id IS NULL AND trim(e.cargo) <> '';

CREATE TABLE IF NOT EXISTS public.hr_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
  tipo_contrato varchar(80) NOT NULL DEFAULT 'INDEFINIDO',
  numero_contrato varchar(120) NOT NULL DEFAULT '',
  fecha_inicio timestamptz NOT NULL,
  fecha_fin timestamptz,
  estado varchar(30) NOT NULL DEFAULT 'ACTIVO',
  salario varchar(40) NOT NULL DEFAULT '',
  renovacion_de_id uuid,
  created_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_employments_employee_start_idx ON public.hr_employments (employee_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS hr_employments_end_idx ON public.hr_employments (fecha_fin);
INSERT INTO public.hr_employments (employee_id, fecha_inicio, estado, created_by)
SELECT e.id, coalesce(e.fecha_ingreso, e.created_at), e.estado, e.creado_por
FROM public.hr_employees e
WHERE NOT EXISTS (SELECT 1 FROM public.hr_employments j WHERE j.employee_id = e.id);

CREATE TABLE IF NOT EXISTS public.hr_employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
  employment_id uuid REFERENCES public.hr_employments(id),
  tipo varchar(60) NOT NULL,
  nombre varchar(255) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  storage_key text NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes integer NOT NULL,
  sha256 varchar(64) NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'VIGENTE',
  fecha_documento timestamptz,
  vence_en timestamptz,
  uploaded_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_employee_documents_employee_idx ON public.hr_employee_documents (employee_id, created_at);
CREATE INDEX IF NOT EXISTS hr_employee_documents_expiry_idx ON public.hr_employee_documents (vence_en);

CREATE TABLE IF NOT EXISTS public.hr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id),
  tipo varchar(30) NOT NULL,
  fecha_inicio timestamptz NOT NULL,
  fecha_fin timestamptz NOT NULL,
  motivo text NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE',
  aprobado_por varchar(255),
  respondido_en timestamptz,
  respuesta text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_requests_employee_idx ON public.hr_requests (employee_id, created_at);
CREATE INDEX IF NOT EXISTS hr_requests_status_idx ON public.hr_requests (estado, tipo);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hr-documents', 'hr-documents', false, 26214400, ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
