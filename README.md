# Sistema de Contratos

Sistema interno de gestión y generación de contratos para PC.

## Stack

- **Frontend:** Next.js / React / TypeScript / Tailwind CSS / shadcn/ui
- **Desktop:** Tauri
- **Datos:** PostgreSQL / Supabase / Drizzle ORM
- **Auth:** Supabase Auth
- **Jobs:** Redis / BullMQ / Worker
- **Documentos:** Playwright / Chromium
- **Storage:** Supabase Storage (inicial)
- **Dev:** pnpm / Turborepo / Docker

## Estructura

```text
contract-system/
├── apps/
│   ├── desktop/          # Tauri
│   ├── web/              # Next.js
│   └── worker/           # BullMQ worker
├── packages/
│   ├── config/           # Configuración compartida
│   ├── db/               # Drizzle + migraciones
│   ├── domain/           # Entidades del dominio
│   ├── eslint-config/    # ESLint compartido
│   ├── tsconfig/         # TypeScript compartido
│   ├── ui/               # shadcn/ui components
│   └── validation/       # Schemas Zod
├── supabase/migrations/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose
- Rust toolchain (para build de Tauri: `rustc`, `cargo`)

## Configuración del entorno

Copiar `.env.example` a `.env` y ajustar valores:

```bash
cp .env.example .env
```

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Levantar servicios (PostgreSQL, Redis)
docker compose up -d

# Generar migración SQL desde el schema Drizzle
pnpm db:generate   # genera en packages/db/drizzle/

# Aplicar migraciones
pnpm db:migrate

# Seed (datos iniciales)
pnpm db:seed

# Lanzar la web en http://localhost:3000
pnpm dev
```

> Las migraciones generadas por Drizzle se copian manualmente a `supabase/migrations/` cuando se aplican vía Supabase. En desarrollo local se aplican con `pnpm db:migrate`.

## Comandos útiles

```bash
pnpm build        # build de todos los paquetes
pnpm lint         # lint de todos los paquetes
pnpm typecheck    # typecheck de todos los paquetes
pnpm test         # tests de todos los paquetes
pnpm format       # formatear código con Prettier
```

## Desktop (Tauri)

Tauri es **multiplataforma**: el código es portable y cada sistema operativo compila su propio binario nativo.

```bash
# Compilar el binario de la plataforma actual
pnpm --filter @contract/desktop build
```

> En Windows genera `contract-desktop.exe` + instalador NSIS. En macOS genera `.app`/`.dmg`. En Linux genera binario ELF + paquetes (deb/rpm/AppImage).

Para compilar los binarios de **Windows, macOS y Linux** en paralelo se usa el build multiplataforma de CI (`.github/workflows/ci.yml` → job `desktop`), usando `tauri-apps/tauri-action` en `windows-latest`, `macos-latest` y `ubuntu-latest`.

> **Nota:** compilar el binario de macOS o Linux no es posible dentro de Windows (cada SO compila el suyo). La CI es el mecanismo estándar para obtener las tres plataformas.

> **Nota build local (Windows/Tauri v2):** por un comportamiento del bundler local, `frontendDist: "../web/out"` puede no resolverse en Windows. Para builds locales apuntar temporalmente a la ruta absoluta `C:\CP System ERP\apps\web\out`. En CI (rutas sin espacios) la ruta relativa funciona. Ambas apuntan al `out/` generado por `next build`.

## Fases del proyecto

1. **Fundación e infraestructura** ✅
2. **Identidad, usuarios, clientes, departamentos y RBAC** ✅
   - Login y sesión (demo local), roles (ADMIN, OPERADOR, SUPERVISOR, AUDITOR, FIRMANTE), matriz de permisos.
   - Vista de Clientes y Departamentos (listado + alta) con validación Zod.
   - Tablas: `users`, `permissions`, `role_permissions`, `activity_events`, `audit_events`.
3. Núcleo contractual ✅
   - Contratos (borrador → emisión → firma → renovación / resolución) con máquina de estados.
   - Cláusulas específicas: separación (S/ 500) e inventario de mueblería; cronograma de pagos como anexo.
   - Snapshot inmutable al emitir; adendas con documento PDF propio (`{código}-ADD-{n}`).
   - Renovaciones (`{código}-R{n}`) heredando condiciones; resolución con cierre de pagos futuros.
   - Tablas: `contracts` (+ `renovado_de`, `separacion`, `muebleria_items`, `motivo_resolucion`, `resuelto_en`), `contract_snapshots`, `contract_clauses`, `contract_annexes`.
4. Document Engine, PDF, Storage e integridad ✅
   - PDFs persistidos en bucket privado de Supabase Storage (`contracts`, solo PDF, 50 MB).
   - Registro de documentos idempotente (`idempotencyKey`) con `storageKey`, `sizeBytes` y `sha256`.
   - PDF del contrato se genera y almacena automáticamente al emitir; adendas al crearse.
   - Descarga storage-first con verificación de huella; fallback a regeneración desde el snapshot inmutable.
   - Verificación de integridad por documento (`GET /api/documents/:id/verify`) y auto-reparación ante alteración.
   - Renderer por tipo de snapshot (contrato / adenda).
5. Dashboard, workflow, actividad y auditoría ✅
   - Dashboard con métricas reales: ocupación, pipeline, ingresos YTD, morosidad, incidencias y clientes con cuotas vencidas.
   - Tablero de workflow (`/workflow`): pendiente de emisión → emitido → pendiente de firma → por vencer.
   - Firma interna con permiso `contract.sign` (rol FIRMANTE) y eventos `CONTRACT_SIGNATURE_REQUESTED` / `CONTRACT_SIGNED`.
   - Actividad y auditoría con catálogo completo, filtros (acción, módulo, resultado, fechas) y actor de usuario.
6. Conectores e integraciones ✅
   - Servicios `ConnectorService` + registro de transports y cifrado de credenciales (AES-256-GCM).
   - Adapters: REST genérico, Google Forms (webhook), Gmail (API) y WhatsApp Business.
   - Idempotencia de despacho y log por conector; UI `/integraciones`.
7. Seguridad, QA, observabilidad y staging ✅
   - Middleware: cabeceras + CSP, rate limit por IP y request-id; headers en `next.config`.
   - Observabilidad: logger JSON, métricas y `/api/health` + `/api/metrics` con healthchecks.
   - QA: suite de tests de dominio, integraciones y web.
   - Staging: `Dockerfile`, `Dockerfile.worker`, `.dockerignore`, `docker-compose.yml`.
8. Producción, recuperación y evolución ✅
   - CI/CD con despliegue a GHCR y webhook (`docs/DEPLOY.md`).
   - Backups/DR automatizados y runbook con pruebas de recuperación (`docs/BACKUP-DR.md`).
   - Higiene del repo y CHANGELOG.

## Arquitectura

La arquitectura mantiene el dominio desacoplado de la infraestructura (Tauri, Supabase, proveedores). El núcleo contractual es independiente y las integraciones externas viven en la capa de infraestructura mediante conectores.
