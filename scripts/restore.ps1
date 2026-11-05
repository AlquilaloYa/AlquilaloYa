# Restaura un respaldo de PostgreSQL. Los .age requieren BACKUP_AGE_IDENTITY.
# Uso:  $env:DATABASE_URL="..."; $env:BACKUP_AGE_IDENTITY="C:\ruta\clave.txt"; .\scripts\restore.ps1 <archivo.dump[.age]> [-Force]
$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "Debe definirse DATABASE_URL" }
if ($args.Count -lt 1) { throw "Uso: restore.ps1 <archivo.dump> [-Force]" }

$DumpInput = $args[0]
$Force = ($args -contains "-Force")

if (-not (Test-Path $DumpInput)) { throw "No existe el archivo: $DumpInput" }

# Verificacion de integridad si hay .sha256.
$ShaFile = "$DumpInput.sha256"
if (Test-Path $ShaFile) {
  Write-Host "Verificando sha256 ..."
  $Expected = ((Get-Content $ShaFile -TotalCount 1) -split '\s+')[0]
  $Actual = (Get-FileHash $DumpInput -Algorithm SHA256).Hash.ToLower()
  if ($Expected -ne $Actual) { throw "Integridad fallida: el backup no coincide con su sha256." }
  Write-Host "sha256 correcto."
}

$Dump = $DumpInput
$TempDump = $null
if ($DumpInput.EndsWith(".age", [StringComparison]::OrdinalIgnoreCase)) {
  if (-not $env:BACKUP_AGE_IDENTITY -or -not (Test-Path $env:BACKUP_AGE_IDENTITY)) {
    throw "BACKUP_AGE_IDENTITY debe apuntar al archivo de clave privada age"
  }
  if (-not (Get-Command age -ErrorAction SilentlyContinue)) { throw "Se requiere age en PATH" }
  $TempDump = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
  try {
    & age --decrypt --identity $env:BACKUP_AGE_IDENTITY --output $TempDump $DumpInput
    if ($LASTEXITCODE -ne 0) { throw "age no pudo descifrar el respaldo ($LASTEXITCODE)" }
    $Dump = $TempDump
  } catch {
    Remove-Item $TempDump -Force -ErrorAction SilentlyContinue
    throw
  }
}

if (-not $Force) {
  Write-Host "ATENCION: se sobrescribira la base de datos de DATABASE_URL."
  $ans = Read-Host "Escribe YES para continuar"
  if ($ans -ne "YES") {
    if ($TempDump) { Remove-Item $TempDump -Force -ErrorAction SilentlyContinue }
    Write-Host "Cancelado."
    exit 1
  }
}

try {
  Write-Host "Restaurando desde $DumpInput ..."
  & pg_restore --dbname=$env:DATABASE_URL --no-owner --no-privileges --clean --if-exists $Dump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore fallo ($LASTEXITCODE)" }
  Write-Host "Restauracion completada."
} finally {
  if ($TempDump) { Remove-Item $TempDump -Force -ErrorAction SilentlyContinue }
}
