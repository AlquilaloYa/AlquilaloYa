# Restaura un respaldo generado por backup.ps1/backup.sh (Fase 8 - DR).
# Uso:  $env:DATABASE_URL="..."; .\scripts\restore.ps1 <archivo.dump> [-Force]
$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "Debe definirse DATABASE_URL" }
if ($args.Count -lt 1) { throw "Uso: restore.ps1 <archivo.dump> [-Force]" }

$Dump = $args[0]
$Force = ($args -contains "-Force")

if (-not (Test-Path $Dump)) { throw "No existe el archivo: $Dump" }

# Verificacion de integridad si hay .sha256.
$ShaFile = "$Dump.sha256"
if (Test-Path $ShaFile) {
  Write-Host "Verificando sha256 ..."
  $Expected = ((Get-Content $ShaFile -TotalCount 1) -split '\s+')[0]
  $Actual = (Get-FileHash $Dump -Algorithm SHA256).Hash.ToLower()
  if ($Expected -ne $Actual) { throw "Integridad fallida: el backup no coincide con su sha256." }
  Write-Host "sha256 correcto."
}

if (-not $Force) {
  Write-Host "ATENCION: se sobrescribira la base de datos de DATABASE_URL."
  $ans = Read-Host "Escribe YES para continuar"
  if ($ans -ne "YES") { Write-Host "Cancelado."; exit 1 }
}

Write-Host "Restaurando desde $Dump ..."
& pg_restore --dbname=$env:DATABASE_URL --no-owner --no-privileges --clean --if-exists $Dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore fallo ($LASTEXITCODE)" }

Write-Host "Restauracion completada."
