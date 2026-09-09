# Copias de seguridad y recuperación (DR) — Fase 8

## Política

- **RPO** (pérdida máxima aceptable): 24 h — backup diario automático.
- **RTO** (tiempo de recuperación objetivo): < 1 h con un dump disponible.
- **Frecuencia**: diaria a las 03:00 UTC (`.github/workflows/backup.yml`) + manual.
- **Retención**: 14 dumps locales (configurable con `BACKUP_RETENTION`) y 30 días
  como artefacto en GitHub.

## Qué se respalda

`pg_dump` en formato **custom** (comprimido) de toda la base: tablas, índices,
secuencias y datos de clientes/contratos/snapshots/documentos. Las credenciales
de conectores están cifradas en reposo (AES-256-GCM) y viajan cifradas en el dump.

> Supabase Storage (PDFs/vouchers) se respalda aparte por el proveedor; este
> runbook cubre la **base de datos**, que es el estado transaccional crítico.

## Crear un backup (manual)

Linux/macOS (o Git Bash/WSL):

```bash
DATABASE_URL="postgres://..." bash scripts/backup.sh backups
# o desde el repo:
DATABASE_URL="postgres://..." pnpm db:backup
```

Windows PowerShell (con `pg_dump` en PATH):

```powershell
$env:DATABASE_URL="postgres://..."; .\scripts\backup.ps1 backups
```

Cada backup produce `contract-<fecha>.dump` y su `contract-<fecha>.dump.sha256`.

## Restaurar

1. Detén la app (evita escrituras concurrentes).
2. Verifica la huella y restaura:

```bash
# Linux/macOS/WSL  (--yes omite la confirmación interactiva)
DATABASE_URL="postgres://..." bash scripts/restore.sh backups/contract-20260101-030000.dump --yes

# PowerShell
$env:DATABASE_URL="postgres://..."; .\scripts\restore.ps1 backups\contract-20260101-030000.dump -Force
```

`restore` usa `pg_restore --clean --if-exists`, por lo que **sobrescribe** el
esquema y los datos del destino.

## Recuperación desde GitHub Actions

1. *Actions → Backup DB → run seleccionado*.
2. Descarga el artefacto `db-backup-<run_id>`.
3. Ejecuta `scripts/restore.sh` contra la base destino.

## Pruebas de recuperación (obligatorio trimestral)

Un backup sin probar no es un backup. Cada trimestre:

1. Genera un dump de producción.
2. Restáuralo en una base **aislada** (contenedor `postgres` temporal).
3. Ejecuta `pnpm --filter @contract/db exec node scripts/verify-restore.mjs`
   *(o una consulta puntual)* para comprobar conteos (`contracts`, `clients`).
4. Registra fecha, tamaño y resultado en este documento.

```bash
docker run --rm -d --name dr-test -e POSTGRES_PASSWORD=pw -p 5433:5432 postgres:16
sleep 5
DATABASE_URL="postgres://postgres:pw@localhost:5433/postgres" \
  bash scripts/restore.sh backups/<dump>.dump --yes
```

## Registro de drills

| Fecha | Dump | Tamaño | Restaurado OK | Responsable |
|-------|------|--------|---------------|-------------|
| — | — | — | — | (pendiente primer drill) |
