#!/usr/bin/env bash
# Restaura un respaldo generado por scripts/backup.sh (Fase 8 - DR).
# Uso: DATABASE_URL=... bash scripts/restore.sh <archivo.dump> [--yes]
set -euo pipefail

: "${DATABASE_URL:?Debe definirse DATABASE_URL}"
DUMP="${1:?Uso: restore.sh <archivo.dump> [--yes]}"
CONFIRM="${2:-}"

if [[ ! -f "$DUMP" ]]; then
  echo "No existe el archivo: $DUMP" >&2
  exit 1
fi

# Verificación de integridad si está disponible la huella.
if [[ -f "$DUMP.sha256" ]]; then
  echo "Verificando sha256 ..."
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
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
