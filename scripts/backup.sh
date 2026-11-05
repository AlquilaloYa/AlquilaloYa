#!/usr/bin/env bash
# Backup cifrado de PostgreSQL. Requiere pg_dump, age y BACKUP_AGE_RECIPIENT.
# Uso: DATABASE_URL=... BACKUP_AGE_RECIPIENT=age1... bash scripts/backup.sh [dir_salida]
set -euo pipefail

: "${DATABASE_URL:?Debe definirse DATABASE_URL}"
: "${BACKUP_AGE_RECIPIENT:?Debe definirse BACKUP_AGE_RECIPIENT (clave publica age)}"
command -v age >/dev/null || { echo "Se requiere age en PATH" >&2; exit 1; }
OUT_DIR="${1:-backups}"
KEEP="${BACKUP_RETENTION:-14}"

mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
DUMP="$OUT_DIR/contract-$TS.dump.age"
TMP_DUMP="$(mktemp)"
trap 'rm -f "$TMP_DUMP"; if [[ ! -f "$DUMP.sha256" ]]; then rm -f "$DUMP"; fi' EXIT

echo "Volcando base de datos a un archivo temporal ..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$TMP_DUMP"

echo "Cifrando el dump con age ..."
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$DUMP" "$TMP_DUMP"
( cd "$OUT_DIR" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256" )

# Retención: conserva los $KEEP dumps cifrados más recientes (y sus .sha256).
ls -1t "$OUT_DIR"/contract-*.dump.age 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do
  echo "Purgando $f"
  rm -f "$f" "$f.sha256"
done

echo "Backup listo: $DUMP"
du -h "$DUMP" | awk '{print "Tamaño:", $1}'
