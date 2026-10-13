# AlquilaYa ERP — Documentación general

Sistema interno de gestión y generación de contratos de arrendamiento (y ERP
operativo) para **AlquilaYa**. Cubre el ciclo comercial, el núcleo contractual,
RR. HH., operaciones/mantenimiento, marketing, contenido web, integraciones y
administración de usuarios con control de acceso por roles.

---

## 1. Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js (App Router) / React / TypeScript / Tailwind CSS |
| UI kit | Componentes propios estilo shadcn/ui (`packages/ui`) |
| Desktop | Tauri v2 (`apps/desktop`) |
| Base de datos | PostgreSQL (Supabase) + Drizzle ORM |
| Autenticación | Supabase Auth |
| Almacenamiento | Supabase Storage (buckets privados) |
| Jobs | Redis + BullMQ (`apps/worker`) |
| Documentos | Playwright / Chromium (render HTML → PDF) |
| Validación | Zod (`packages/validation`) |
| Integraciones | Conectores REST: WhatsApp, Gmail, Google Forms, genérico |
| Monorepo | pnpm workspaces + Turborepo |
| CI/CD | GitHub Actions → GHCR + webhook de despliegue |
| Contenedores | Docker / Docker Compose |

---

## 2. Estructura del monorepo

```text
contract-system/
├── apps/
│   ├── web/        # Next.js (UI + API routes)
│   ├── worker/     # BullMQ worker (PDF y notificaciones)
│   └── desktop/    # Tauri (binario de escritorio multiplataforma)
├── packages/
│   ├── config/       # Env validado con zod (t3-oss/env-core)
│   ├── db/           # Drizzle ORM, schema, repositorios, seed
│   ├── domain/       # Entidades y reglas de negocio (núcleo)
│   ├── integrations/ # Conectores y servicio de integraciones
│   ├── validation/   # Esquemas Zod compartidos
│   ├── ui/           # Componentes de UI compartidos
│   ├── eslint-config/# ESLint compartido
│   └── tsconfig/     # TypeScript compartido
├── supabase/migrations/   # Migraciones SQL (Supabase + Drizzle)
├── scripts/               # Backups, restauración, seeds puntuales
├── docs/                  # DEPLOY, BACKUP-DR, WHATSAPP-API, producción
├── docker-compose.yml
├── Dockerfile / Dockerfile.worker
└── turbo.json / pnpm-workspace.yaml
```

---

## 3. Módulos funcionales

Agrupados como aparecen en la barra lateral (`apps/web/src/components/dashboard-shell.tsx`).

### 3.1 Dashboard
- `/dashboard`: métricas reales — ocupación, pipeline, ingresos YTD, morosidad,
  incidencias y clientes con cuotas vencidas.
- API: `GET /api/dashboard`.

### 3.2 Solicitudes de cambio
- `/solicitudes-permiso`: los roles de solo lectura (RRHH, Asistente) piden
  autorización para modificar algo. Las ven y resuelven el **Developer** y los
  **Administradores**.
- API: `GET/POST /api/solicitudes-permiso`,
  `PATCH /api/permission-requests/[id]`, `GET/POST /api/permission-requests`.
- Tablas: `permission_requests`.

### 3.3 Disponibilidad
- `/disponibilidad` y `/disponibilidad/[codigo]`: estado de departamentos.
- API pública: `GET /api/publico/disponibilidad`,
  `GET /api/publico/estado-departamentos`.

### 3.4 Panel Web (contenido del sitio)
- `/contenido-web`: edición de contenido, propiedades, imágenes y ajustes del
  sitio. Componentes en `apps/web/src/components/contenido-web/`.
- API: `ALL /api/contenido-web/[...path]`.

### 3.5 Marketing (grupo)
- `/pipeline` — embudo de leads. API: `GET/POST /api/leads`.
- `/mensajes` — bandeja de mensajería. API: `GET /api/conversaciones`,
  `GET/POST /api/conversaciones/[id]/mensajes`, `POST /api/conversaciones/derivar`,
  `GET /api/canales/estado`, `POST /api/webhooks/mensajes`, `POST /api/webhooks/meta`.
- `/chat-clientes` — chat con clientes.
- `/automatizaciones` — reglas y ejecuciones. API: `GET/POST /api/automatizaciones`,
  `POST /api/automatizaciones/evaluar`, `GET /api/cron/automatizaciones`,
  `GET/POST /api/bots`.
- Tablas: `leads`, `conversations`, `messages`, `message_templates`,
  `automation_rules`, `automation_runs`, `bot_rules`.

### 3.6 Sistema de Contratos (grupo)
- `/contactos` — personas de contacto. API: `GET/POST /api/contactos`. Tabla: `contacts`.
- `/departamentos` (Uni/Dep) — unidades y precios. API: `GET/POST /api/departamentos`,
  `GET/PATCH /api/departamentos/[id]`.
- `/contratos` (Pre contrato) y `/contratos/[id]`, `/contratos/clientes/[id]`.
  API: `GET/POST /api/contracts`, `GET/PATCH /api/contracts/[id]`,
  `GET /api/contracts/[id]/documents`, `GET /api/contracts/[id]/client`.
- `/contrato-final` y `/contrato-final/[id]` — emisión, firma y cierre.
- `/adendas` — adendas con documento propio `{código}-ADD-{n}`.
  API: `GET/POST /api/adendas`, `GET/PATCH /api/adendas/[id]`.
- Servicios extras (pestaña en `/contratos/[id]` y opción en `/pagos`) —
  opciones independientes de internet (S/ 39) y/o recargo por carga eléctrica
  (S/ 60); genera el documento "Pagos extras por conexión y medio de carga" con
  firmas del arrendatario y el arrendador, y registra el día de pago según el
  contrato. API: `GET/POST /api/servicios-extras`,
  `GET /api/servicios-extras/[id]`, `GET /api/servicios-extras/[id]/download`.
- `/plantillas` — plantillas de contrato versionadas. API: `GET/POST /api/plantillas`,
  `GET/POST /api/templates`, `.../versions`, `.../versions/[versionId]/html`,
  `.../versions/[versionId]/pdf`.
- Tablas: `contracts`, `contract_snapshots`, `contract_clauses`, `contract_annexes`,
  `templates`, `template_versions`, `template_departments`,
  `clauses`, `clause_versions`, `annexes`, `annex_versions`, `servicios_extras`.

Características del núcleo contractual:
- Máquina de estados borrador → emisión → firma → renovación / resolución.
- Cláusulas específicas: separación (S/ 500) e inventario de mueblería;
  cronograma de pagos como anexo.
- Snapshot inmutable al emitir; PDF generado y almacenado automáticamente.
- Renovaciones `{código}-R{n}` heredando condiciones.

### 3.7 Clientes
- `/clientes`: listado y alta. API: `GET/POST /api/clientes`, `GET/POST /api/clients`.
  Tabla: `clients`.

### 3.8 Cobranza
- `/pagos`: pagos y cobranza. API: `GET/POST /api/payments`,
  `GET /api/cobranza-vendedores`, `GET /api/analiticas-cobranza`. Tabla: `payments`.

### 3.9 Analíticas
- `/analiticas`: reportes. API: `GET /api/analiticas-cobranza`,
  `GET /api/cobranza-vendedores`.

### 3.10 Workflow
- `/workflow`: pendiente de emisión → emitido → pendiente de firma → por vencer.
  API: `GET /api/workflow`.

### 3.11 Checklist
- `/checklist`: checklist operativo (origen de órdenes de trabajo).
- API relacionada: `GET/POST /api/inventarios`, `GET/POST /api/inspecciones`,
  `GET /api/inspecciones/plantillas`, `POST /api/inspecciones/pdf`,
  `POST /api/pdf/extraer`.

### 3.12 Work 123
- `/work-123`: tablero tipo kanban de trabajo. API: `GET/POST /api/tareas`.
  Tabla: `tasks`.

### 3.13 Agenda
- `/agenda`: agenda personal por usuario + Google Calendar.
  API: `GET/POST /api/agenda`, `GET /api/agenda/google/authorize`,
  `GET /api/agenda/google/callback`, `POST /api/agenda/google/disconnect`.
  Tablas: `tasks`, `user_google_tokens`.

### 3.14 Recursos Humanos (grupo)
- `/rrhh`: expedientes, estructura organizacional, solicitudes y onboarding.
  API: `GET/POST /api/rrhh`, `GET/PATCH /api/rrhh/[id]`,
  `.../[id]/empleos`, `.../[id]/documentos`,
  `.../[id]/documentos/[documentId]`, `.../[id]/onboarding`,
  `GET /api/rrhh/estructura`, `GET /api/rrhh/dashboard`,
  `GET /api/rrhh/asignables`, `GET/POST /api/rrhh/solicitudes`,
  `PATCH /api/rrhh/solicitudes/[id]`.
- `/cronograma-asistencia` (Registro de asistencia): `GET/POST /api/asistencias`.
- `/directorio`: directorio laboral (nombres y cargo).
- Tablas: `hr_employees`, `hr_organizations`, `hr_sites`, `hr_departments`,
  `hr_teams`, `hr_positions`, `hr_employments`, `hr_employee_documents`,
  `hr_requests`, `hr_employee_history`, `hr_onboarding_processes`,
  `hr_onboarding_tasks`, `attendance`.

### 3.15 Operaciones / Órdenes de trabajo
- `/operaciones`: panel ERP de despacho. Crea órdenes para las sedes Angamos y
  Benavides, asocia residente + departamento UNI/DEP, asigna a personal de
  Mantenimiento, adjunta evidencias fotográficas y consulta estado/historial.
  API: `GET/POST /api/operaciones/ordenes`,
  `GET/PATCH /api/operaciones/ordenes/[id]`,
  `GET/POST /api/operaciones/ordenes/[id]/materiales`,
  `POST /api/operaciones/ordenes/[id]/evidencias`,
  `GET /api/operaciones/empleados`, `GET /api/operaciones/catalogos`.
- Evidencias en bucket privado `work-order-evidence`.
- Tablas: `work_orders`, `work_order_assignments`, `work_order_visits`,
  `work_order_materials`, `work_order_events`, `work_order_attachments`.
- Los materiales guardan cantidad, unidad, costo unitario/total y
  observaciones; cada registro genera un evento auditable. La vinculación con
  reservas y salidas de inventario aún está pendiente.
- (La aceptación de tareas por el trabajador y la app móvil Expo son fases futuras.)

### 3.16 Google SyS (grupo)
- `/google/[app]` con apps: Gmail, Drive, Sheets, Docs, Tasks.
- APIs de documentos: `GET/POST /api/documents`,
  `GET /api/documents/[id]`, `GET /api/documents/[id]/verify`,
  `GET /api/documents/[id]/drive`, `POST /api/documents/pdf`,
  `POST /api/documents/notarial`.

### 3.17 Configuración / Administración
- `/auditoria`: `GET /api/audit`. Tabla: `audit_events`.
- `/actividad`: `GET /api/activity`. Tabla: `activity_events`.
- `/integraciones`: `GET/POST /api/integrations`, `GET/PATCH /api/integrations/[id]`.
  Tablas: `connector_instances`, `connector_credentials`, `connector_logs`.
- `/configuraciones/usuarios`: `GET/POST /api/users`, `PATCH/DELETE /api/users/[id]`,
  `GET/PUT /api/users/[id]/permissions`. Tablas: `users`, `permissions`,
  `role_permissions`, `user_permissions`.
- Cerrar sesión: `POST /api/auth/logout`.

### 3.18 Sesión / autenticación
- `/login`: inicio de sesión.
- API: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- Observabilidad: `GET /api/health`, `GET /api/metrics`.

---

## 4. Roles y control de acceso (RBAC)

Definido en `packages/domain/src/rbac/`. La autorización de runtime usa la
**matriz en código** (`AccessControl.forRole`), no la tabla `role_permissions`
(esta última solo la puebla el seed).

### 4.1 Roles (`role.ts`)

| Rol | Descripción |
| --- | --- |
| `DEVELOPER` | Tiene todos los permisos, gestiona permisos individuales y asigna el rol DEVELOPER. |
| `ADMIN` | Controla y edita todo: elimina usuarios y aprueba solicitudes. No puede solicitar permisos. |
| `RRHH` | Solo lectura de la operación; para modificar pide permiso al Developer. |
| `ASISTENTE_ADMINISTRATIVO` | Igual que RRHH + lectura de Google SyS y Marketing. |
| `MARKETING` | Solo lectura del módulo de Marketing. |

> Paridad actual: **ADMIN** y **DEVELOPER** comparten la misma matriz; la única
> diferencia es que ADMIN no puede `permission_request.create` (no lo necesita).

### 4.2 Permisos (`permissions.ts`, 40 en total)

`hr.read`, `hr.directory.read`, `hr.request.create`, `hr.create`, `hr.update`,
`attendance.read`, `attendance.create`,
`client.read`, `client.create`, `client.update`,
`department.read`, `department.create`, `department.update`,
`contract.read`, `contract.create`, `contract.update`, `contract.emit`,
`contract.sign`, `contract.cancel`,
`document.read`, `document.download`, `activity.read`, `audit.read`,
`template.read`, `template.manage`,
`integration.read`, `integration.manage`,
`web_content.read`, `web_content.update`,
`user.read`, `user.manage`, `role.manage`, `user.delete`,
`permission_request.create`, `permission_request.read`, `permission_request.approve`,
`marketing.read`,
`work_order.read`, `work_order.create`, `work_order.update`.

### 4.3 Matriz resumida (`role-permissions.ts`)

| Rol | Permisos |
| --- | --- |
| DEVELOPER | Todos (excepto `permission_request.create`). |
| ADMIN | Todos (excepto `permission_request.create`). |
| RRHH | `hr.read`, `hr.directory.read`, `hr.request.create`, `client.read`, `department.read`, `contract.read`, `document.read`, `template.read`, `work_order.read`, `permission_request.create`. |
| ASISTENTE_ADMINISTRATIVO | Igual que RRHH + `marketing.read`. |
| MARKETING | `marketing.read`. |

Además existen **permisos individuales por usuario** (`user_permissions`):
un ADMIN/DEVELOPER puede otorgar permisos puntuales, incluidos los reservados
(`user.delete`, `permission_request.approve`). El invariante de un único
DEVELOPER se protege con la lógica de la API y el índice parcial
`users_single_developer_idx`.

---

## 5. Modelo de datos (tablas PostgreSQL)

Fuente: `packages/db/src/schema/*` (Drizzle).

| Dominio | Tablas |
| --- | --- |
| Identidad / RBAC | `users`, `permissions`, `role_permissions`, `user_permissions`, `permission_requests` |
| Auditoría / actividad | `activity_events`, `audit_events` |
| Clientes y departamentos | `clients`, `departments` |
| Contratos | `contracts`, `contract_snapshots`, `contract_clauses`, `contract_annexes` |
| Plantillas / cláusulas / anexos | `templates`, `template_versions`, `template_departments`, `clauses`, `clause_versions`, `annexes`, `annex_versions` |
| Documentos | `documents` |
| Pagos | `payments` |
| Operaciones | `contacts`, `separations`, `department_inventories`, `inventario_catalogo`, `inspections`, `inspection_questions`, `inspection_templates` |
| Tareas / agenda | `tasks`, `user_google_tokens` |
| RR. HH. | `hr_employees`, `hr_organizations`, `hr_sites`, `hr_departments`, `hr_teams`, `hr_positions`, `hr_employments`, `hr_employee_documents`, `hr_requests`, `hr_employee_history`, `hr_onboarding_processes`, `hr_onboarding_tasks`, `attendance` |
| Órdenes de trabajo | `work_orders`, `work_order_assignments`, `work_order_visits`, `work_order_events`, `work_order_attachments` |
| Marketing / mensajería | `leads`, `conversations`, `messages`, `message_templates`, `automation_rules`, `automation_runs`, `bot_rules` |
| Integraciones | `connector_instances`, `connector_credentials`, `connector_logs` |

Workflow de migraciones: Drizzle genera SQL en `packages/db/drizzle/` y también
se versionan migraciones en `supabase/migrations/` (0001 → 0050 y series
`202610071*`). Comandos: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`,
`pnpm db:seed`, `pnpm db:users`.

---

## 6. Capa de dominio (`packages/domain`)

Módulos exportados desde `packages/domain/src/index.ts`:

- `client`, `department`, `contract`, `template`, `clause`, `annex`,
  `snapshot`, `document`, `rbac`, `activity`, `workflow`, `integration`, `common`.

El dominio mantiene la lógica desacoplada de la infraestructura; los proveedores
externos viven en la capa de conectors/adapters.

---

## 7. Worker de jobs (`apps/worker`)

- Colas BullMQ: `pdf-generation` (concurrencia 2) y `notifications` (concurrencia 5).
- Genera el PDF del contrato/adenda con Playwright/Chromium y lo guarda en
  Supabase Storage; registro de documento idempotente
  (`contract:{contractId}:document:{snapshotId}`).
- Archivos: `src/index.ts`, `src/queues.ts`, `src/pdf/*`, `src/storage/*`,
  `src/db/*`.

---

## 8. App de escritorio (Tauri)

- `apps/desktop` (Tauri v2). El código es portable; cada SO compila su binario.
- Build local: `pnpm --filter @contract/desktop build` (Windows → `.exe` + NSIS).
- Multiplataforma (Windows/macOS/Linux) vía CI (`.github/workflows/ci.yml`, job
  `desktop` con `tauri-apps/tauri-action`).

---

## 9. Integraciones

`packages/integrations` (`src/core`, `src/rest`):

- `ConnectorService` + registro de transports y cifrado de credenciales
  (AES-256-GCM, `CONNECTOR_ENCRYPTION_KEY`).
- Adapters: REST genérico, Google Forms (webhook), Gmail (API), WhatsApp Business.
- Idempotencia de despacho y log por conector; UI en `/integraciones`.
- Documentación de WhatsApp: `docs/WHATSAPP-API.md`.

---

## 10. Seguridad, observabilidad y QA

- Middleware: cabeceras de seguridad + CSP, rate limit por IP y request-id.
- Logger JSON estructurado, métricas en memoria, `/api/health` y `/api/metrics`.
- Headers adicionales definidos en `next.config`.
- Suite de tests de dominio, integraciones y web.

---

## 11. Infraestructura, despliegue y recuperación

- CI/CD: workflow `deploy.yml` publica imágenes web+worker en GHCR y notifica un
  webhook (`DEPLOY_ENABLED`, `DEPLOY_WEBHOOK_URL`).
- Contenedores: `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml`
  (PostgreSQL, Redis, web, worker) con healthchecks.
- Vercel: `vercel.json` (incluye Vercel Cron para automatizaciones).
- Backups/DR: `scripts/backup.(sh|ps1)`, `scripts/restore.(sh|ps1)`,
  `scripts/verify-restore.mjs`, workflow `backup.yml` (diario, artefacto 30 días).
- Runbooks: `docs/DEPLOY.md` y `docs/BACKUP-DR.md`.

---

## 12. Variables de entorno

Referencia completa en `.env.example`. Principales:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Conexión PostgreSQL. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin (crear usuarios Auth, Storage). |
| `SUPABASE_ANON_KEY` | Validar tokens de Supabase Auth. |
| `SUPABASE_STORAGE_BUCKET` | Bucket de documentos (por defecto `contracts`). |
| `REDIS_URL` | Conexión BullMQ. |
| `CONNECTOR_ENCRYPTION_KEY` | Cifrado de credenciales (≥24 bytes; obligatoria en prod). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Agenda/Google Calendar. |
| `MESSAGING_WEBHOOK_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Mensajería / WhatsApp. |
| `ALQUILAYA_API_URL`, `ALQUILAYA_ADMIN_EMAIL`, `ALQUILAYA_ADMIN_PASSWORD` | Panel web AlquilaYa. |
| `CRON_SECRET` | Protección del cron de automatizaciones. |

---

## 13. Desarrollo

```bash
pnpm install            # instalar dependencias
docker compose up -d    # PostgreSQL + Redis

pnpm db:generate        # generar migración desde el schema Drizzle
pnpm db:migrate         # aplicar migraciones
pnpm db:seed            # datos iniciales (permisos, roles, usuarios, demo)

pnpm dev                # turbo run dev (web en http://localhost:3000)
pnpm build              # build web + worker
pnpm lint               # eslint
pnpm typecheck          # tsc
pnpm test               # vitest
pnpm format             # prettier
```

Requisitos: Node ≥ 20, pnpm ≥ 9, Docker, y Rust (solo para compilar Tauri).

---

## 14. Fases del proyecto

1. Fundación e infraestructura ✅
2. Identidad, usuarios, clientes, departamentos y RBAC ✅
3. Núcleo contractual (contratos, cláusulas, snapshots, renovaciones) ✅
4. Document Engine, PDF, Storage e integridad ✅
5. Dashboard, workflow, actividad y auditoría ✅
6. Conectores e integraciones ✅
7. Seguridad, QA, observabilidad y staging ✅
8. Producción, recuperación y evolución ✅
- Módulos posteriores: Órdenes de trabajo / Operaciones, RR. HH. ampliado,
  Asistencia, Marketing/mensajería, Contenido Web, RBAC granular con permisos
  individuales y solicitudes de cambio.

---

## 15. Notas de estado (actualizado)

- RBAC con **paridad total ADMIN ↔ DEVELOPER** y permisos individuales por
  usuario (`user_permissions`) más solicitudes de aprobación.
- Esquema de base sincronizado: `user_permissions` creada,
  `permission_requests.resolved_at` añadida, `role_permissions.role` ampliada a
  `varchar(50)`, catálogo `permissions` con 40 claves y 100 filas en
  `role_permissions`.
- La autorización de runtime proviene de la matriz en
  `packages/domain/src/rbac/role-permissions.ts`; `role_permissions` en BD solo
  es informativa (la puebla el seed).
