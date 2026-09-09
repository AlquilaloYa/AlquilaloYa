# Despliegue de producción

## Componentes

- Next.js: desplegar `apps/web` detrás de HTTPS.
- PostgreSQL y Storage: proyecto Supabase de producción separado.
- Redis: instancia de producción privada.
- Worker: imagen `Dockerfile.worker`, con Chromium/Chrome disponible.
- Desktop: instalador Tauri firmado para PCs autorizadas.

## Flujo

```text
Development -> typecheck/lint/test -> Staging -> Security Gate -> Production
```

Nunca se reutilizan credenciales, base de datos, Redis o Storage entre staging y producción.

## Variables críticas

`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `REDIS_URL` y `CONNECTOR_ENCRYPTION_KEY` son secretos de servidor/worker. No se incluyen en el frontend ni en Tauri.

## Healthcheck

```text
GET /api/health
```

La respuesta `200` requiere conectividad con PostgreSQL. Una respuesta `503` debe sacar la instancia del balanceador.

## Escalado

El worker es stateless. Se puede ejecutar más de una réplica; BullMQ coordina los jobs mediante Redis.
