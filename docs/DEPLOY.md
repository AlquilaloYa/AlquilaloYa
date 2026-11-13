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

### Rate limiting por tipo de ruta

El middleware aplica límites por IP y ruta, compartidos entre instancias cuando
Upstash está configurado:

| Grupo | Límite |
|-------|--------|
| API general | 300 solicitudes por minuto por categoría de ruta |
| Login (`/api/*/auth/login`) | 10 solicitudes cada 15 minutos |
| Verificación MFA (`/api/auth/mfa/verify`) | 10 solicitudes cada 15 minutos |
| Rutas con segmento `/pdf` | 20 solicitudes por minuto |

Las rutas de login y operaciones PDF tienen contadores separados del límite general.
Los endpoints de portal que ya tienen un limitador específico conservan también ese
control. Una respuesta `429` incluye `Retry-After` y encabezados `X-RateLimit-*`.
`GET /api/metrics` muestra el total de bloqueos y un desglose por categoría de ruta;
los contadores de métricas son locales al proceso y no sustituyen la observabilidad
persistente de Upstash.

Antes de cambiar estos valores, revisar los `429` y los logs `rate_limited`; usuarios
que comparten una IP pública también comparten el límite. Upstash debe configurarse
como variables de entorno de runtime en el proveedor donde corre la aplicación, no
solo como secretos del workflow de GitHub.

### Cloudflare WAF (configuración externa)

El repositorio no puede habilitar Cloudflare WAF por sí solo. Para que las reglas
protejan el ERP, el dominio debe estar proxied por Cloudflare y el tráfico al origen
debe pasar efectivamente por esa capa. En el panel de Cloudflare:

1. Habilitar las reglas administradas de Cloudflare y el conjunto OWASP disponible
   en el plan.
2. Crear reglas de rate limiting para `POST /api/auth/login` y
   `POST /api/auth/mfa/verify`, con umbral compatible con el límite de aplicación,
   respuesta `429` y mitigación temporal. Mantener el login de clientes separado si
   usa una ruta propia.
3. Considerar reglas específicas para `/api/*/pdf` y endpoints de carga, evitando
   bloquear webhooks legítimos o redes compartidas sin revisar primero sus patrones
   de tráfico.
4. Probar primero en modo de registro/preview cuando esté disponible; luego activar
   bloqueo y revisar eventos de seguridad, falsos positivos y respuestas `429`.
5. Confirmar que no se pueda llegar directamente al origen evitando Cloudflare.

La IP de origen debe obtenerse de una cabecera que el proxy confiable sobrescriba;
no se debe confiar en cabeceras enviadas por el cliente si el origen también es
accesible directamente. La presencia de estas instrucciones no confirma que la zona,
las reglas WAF o una IP de origen fija estén configuradas en producción.

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

Antes de subir la nueva versión, aplica en Supabase, en este orden:

1. `supabase/migrations/20261113132351_servicios_extras_pagos.sql`
2. `supabase/migrations/20261113132352_client_payment_approval_requests.sql`

La primera crea los pagos mensuales de servicios y migra los vouchers existentes
usando las columnas presentes en la tabla de servicios. Esta carpeta es la fuente
de verdad para la base administrada; no uses `pnpm db:migrate` en producción porque
el historial de Drizzle está desincronizado (ver `README.md`).

Orden recomendado: **migrar → desplegar** (las migraciones son aditivas y
retrocompatibles para no romper la versión en ejecución).

### Avisos push de tareas en Agenda

Para habilitar recordatorios push del navegador:

1. Configura `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y
   `WEB_PUSH_SUBJECT` en el entorno de producción. Genera el par con
   `corepack pnpm --filter @contract/web exec web-push generate-vapid-keys`;
   guarda la clave privada solo como secreto del servidor.
2. Despliega la migración `20261111120000_task_browser_push.sql`.
3. En GitHub Actions configura la variable `ERP_BASE_URL` con la URL HTTPS
   pública del ERP y el secreto `CRON_SECRET` con el mismo valor configurado en
   Vercel. El workflow `task-reminders.yml` invoca el endpoint cada 30 minutos;
   Vercel Hobby no necesita ni usa un cron de alta frecuencia.
4. Cada usuario debe conectar su Google Calendar y activar los avisos push desde
   Agenda en cada navegador/dispositivo. Los avisos se envían a la cuenta que
   creó la tarea, de 8:00 a. m. a 6:00 p. m. hora de Lima, el día de vencimiento.
   Se repiten cada 30 minutos hasta eliminar la tarea de Agenda. GitHub puede
   iniciar cron workflows con retraso, por lo que la hora exacta no está garantizada.

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
