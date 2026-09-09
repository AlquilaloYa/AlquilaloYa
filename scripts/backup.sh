#!/usr/bin/env bash
# Backup de la base de datos (Fase 8 - DR). Formato custom de pg_dump.
# Uso: DATABASE_URL=... bash scripts/backup.sh [dir_salida]
set -euo pipefail

: "${DATABASE_URL:?Debe definirse DATABASE_URL}"
OUT_DIR="${1:-backups}"
KEEP="${BACKUP_RETENTION:-14}"

mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
DUMP="$OUT_DIR/contract-$TS.dump"

echo "Volcando base de datos a $DUMP ..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$DUMP"

# Huella para verificar integridad del respaldo.
( cd "$OUT_DIR" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256" )

# Retención: conserva los $KEEP dump más recientes (y sus .sha256).
ls -1t "$OUT_DIR"/contract-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do
  echo "Purgando $f"
  rm -f "$f" "$f.sha256"
done

echo "Backup listo: $DUMP"
du -h "$DUMP" | awk '{print "Tamaño:", $1}'
