# Despliegue (Fase 8)

## Imágenes

CI publica dos imágenes en GHCR al fusionar en `main` (`.github/workflows/deploy.yml`):

- `ghcr.io/<org>/<repo>-web` → app Next.js (`Dockerfile`)
- `ghcr.io/<org>/<repo>-worker` → worker BullMQ (`Dockerfile.worker`)

Cada imagen lleva las etiquetas `latest` y `sha-<commit>`.

### Requisitos GHCR

1. **Permisos del workflow**: ya declarados (`packages: write`).
2. **Visibilidad**: si el repo es privado, autoriza el acceso al token `GITHUB_TOKEN`
   o marca el paquete como interno. Un miembro con `admin` puede ajustar la visibilidad
   en *Packages → Settings*.

## Entornos y secretos (GitHub → Settings → Secrets and variables → Actions)

| Tipo | Clave | Descripción |
|------|-------|-------------|
| Secret | `DEPLOY_WEBHOOK_URL` | Endpoint que reinicia/actualiza el servicio. |
| Secret | `DEPLOY_WEBHOOK_SECRET` | Cabecera `X-Deploy-Secret` para autenticar el hook. |
| Variable | `DEPLOY_ENABLED` | `true` para correr el job `deploy`. |
| Secret | `DATABASE_URL` | Cadena de conexión Postgres (también la usa `backup.yml`). |
| Secret | `UPSTASH_REDIS_REST_URL` | URL REST de Upstash para rate limiting distribuido del middleware web. |
| Secret | `UPSTASH_REDIS_REST_TOKEN` | Token REST de Upstash para rate limiting distribuido. |

> Sin `DEPLOY_ENABLED=true` el build de imágenes corre pero el despliegue se omite.

Si las variables de Upstash no están configuradas, el middleware usa un límite local
por proceso como fallback. Para producción con varias instancias se recomienda
configurarlas; `REDIS_URL` continúa reservado para BullMQ del worker.

## Puesta en marcha con Docker Compose (VPS / staging)

```bash
git clone <repo> && cd <repo>
cp .env.example .env        # edita DATABASE_URL, SUPABASE_*, CONNECTOR_ENCRYPTION_KEY

docker compose up -d --build
docker compose logs -f web   # confirmar que /api/health responde ok
```

El `web` expone el 3000 con `HEALTHCHECK` hacia `/api/health` (ver Fase 7).
Para producción con Postgres/Supabase administrados, comenta el servicio `postgres`
del compose y apunta `DATABASE_URL` al pooler.

## Migraciones en despliegue

Antes de subir la nueva versión de la app:

```bash
# desde el repo (necesita DATABASE_URL)
corepack pnpm db:migrate
```

Orden recomendado: **migrar → desplegar** (las migraciones son aditivas y
retrocompatibles para no romper la versión en ejecución).

## Health & observabilidad

- `GET /api/health` → estado de la DB y latencia.
- `GET /api/metrics` → contadores de peticiones, errores 5xx y bloqueos por rate limit.

## Rollback

Despliega la etiqueta `sha-<commit>` anterior de la imagen ya publicada en GHCR:

```bash
docker compose pull && WEB_TAG=sha-<anterior> docker compose up -d web
```

Si el rollback implica una migración destructiva, restaura desde un backup
(ver `BACKUP-DR.md`) en lugar de solo reetiquetar la imagen.
