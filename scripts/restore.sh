#!/usr/bin/env bash
# Restaura un respaldo de PostgreSQL. Los .age requieren BACKUP_AGE_IDENTITY.
# Uso: DATABASE_URL=... BACKUP_AGE_IDENTITY=... bash scripts/restore.sh <archivo.dump[.age]> [--yes]
set -euo pipefail

: "${DATABASE_URL:?Debe definirse DATABASE_URL}"
DUMP_INPUT="${1:?Uso: restore.sh <archivo.dump[.age]> [--yes]}"
CONFIRM="${2:-}"

if [[ ! -f "$DUMP_INPUT" ]]; then
  echo "No existe el archivo: $DUMP_INPUT" >&2
  exit 1
fi

# Verifica la huella del archivo cifrado antes de descifrarlo.
if [[ -f "$DUMP_INPUT.sha256" ]]; then
  echo "Verificando sha256 ..."
  ( cd "$(dirname "$DUMP_INPUT")" && sha256sum -c "$(basename "$DUMP_INPUT").sha256" )
fi

TMP_DUMP=""
DUMP="$DUMP_INPUT"
if [[ "$DUMP_INPUT" == *.age ]]; then
  : "${BACKUP_AGE_IDENTITY:?Debe definirse BACKUP_AGE_IDENTITY con la ruta a la clave privada age}"
  command -v age >/dev/null || { echo "Se requiere age en PATH" >&2; exit 1; }
  TMP_DUMP="$(mktemp)"
  trap 'rm -f "$TMP_DUMP"' EXIT
  age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$TMP_DUMP" "$DUMP_INPUT"
  DUMP="$TMP_DUMP"
fi

# Salvaguarda: la restauración con --clean elimina objetos existentes.
if [[ "$CONFIRM" != "--yes" ]]; then
  echo "ATENCION: se sobreescribira la base de datos de DATABASE_URL."
  read -r -p "Escribe YES para continuar: " ans
  [[ "$ans" == "YES" ]] || { echo "Cancelado."; exit 1; }
fi

echo "Restaurando desde $DUMP ..."
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --jobs=4 \
  "$DUMP"

echo "Restauracion completada."
