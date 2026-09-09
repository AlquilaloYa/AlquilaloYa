# Changelog

Formato *Keep a Changelog*; versiones *Semantic Versioning*.

## [0.1.0]

### Añadido — Fase 8 (Producción, recuperación y evolución)
- CI/CD: workflow `deploy.yml` que publica imágenes web+worker en GHCR y notifica un
  webhook de despliegue (`DEPLOY_ENABLED`/`DEPLOY_WEBHOOK_URL`).
- Copias de seguridad: `scripts/backup.sh|ps1`, `scripts/restore.sh|ps1` (pg_dump
  custom + sha256 + retención) y workflow `backup.yml` (diario, artefacto 30 días).
- Verificación de recuperación: `scripts/verify-restore.mjs`.
- Documentación operativa: `docs/DEPLOY.md` y `docs/BACKUP-DR.md` con runbook y
  registro de drills.
- Scripts de raíz `db:backup` / `db:restore`.
- Higiene del repo: eliminados artefactos temporales de desarrollo.
- Lint global verde (imports/símbolos sin uso y reglas ESLint inexistentes) para
  desbloquear el job `quality` de CI.

### Añadido — Fase 7 (Seguridad, observabilidad, QA, staging)
- Middleware de seguridad (cabeceras/CSP + rate limit por IP + request-id).
- Logger JSON estructurado, métricas en memoria y `/api/metrics`.
- `Dockerfile`, `.dockerignore` y `docker-compose.yml` con healthchecks.
- Suite de tests ampliada (rate-limit, logger, métricas, render de plantillas,
  cláusulas fijas).
