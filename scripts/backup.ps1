# Backup cifrado de PostgreSQL para Windows/PowerShell.
# Requiere pg_dump, age y DATABASE_URL / BACKUP_AGE_RECIPIENT definidas.
# Uso:  $env:DATABASE_URL="..."; $env:BACKUP_AGE_RECIPIENT="age1..."; .\scripts\backup.ps1 [dir_salida]
$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "Debe definirse DATABASE_URL" }
if (-not $env:BACKUP_AGE_RECIPIENT) { throw "Debe definirse BACKUP_AGE_RECIPIENT (clave publica age)" }
if (-not (Get-Command age -ErrorAction SilentlyContinue)) { throw "Se requiere age en PATH" }
$OutDir = if ($args.Count -ge 1) { $args[0] } else { "backups" }
$Keep = if ($env:BACKUP_RETENTION) { [int]$env:BACKUP_RETENTION } else { 14 }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Ts = Get-Date -Format "yyyyMMdd-HHmmss"
$Dump = Join-Path $OutDir "contract-$Ts.dump.age"
$TempDump = Join-Path ([System.IO.Path]::GetTempPath()) "contract-$Ts-$([Guid]::NewGuid().ToString('N')).dump"

try {
  Write-Host "Volcando base de datos a un archivo temporal ..."
  & pg_dump $env:DATABASE_URL --format=custom --compress=6 --no-owner --no-privileges --file=$TempDump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo ($LASTEXITCODE)" }

  Write-Host "Cifrando el dump con age ..."
  & age --encrypt --recipient $env:BACKUP_AGE_RECIPIENT --output $Dump $TempDump
  if ($LASTEXITCODE -ne 0) { throw "age fallo ($LASTEXITCODE)" }

  $Hash = (Get-FileHash $Dump -Algorithm SHA256).Hash.ToLower()
  "$Hash  $(Split-Path $Dump -Leaf)" | Set-Content -Encoding ascii -NoNewline "$Dump.sha256"
} catch {
  Remove-Item $Dump -Force -ErrorAction SilentlyContinue
  Remove-Item "$Dump.sha256" -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item $TempDump -Force -ErrorAction SilentlyContinue
}

# Retencion: conservar los $Keep dumps cifrados mas recientes.
Get-ChildItem (Join-Path $OutDir "contract-*.dump.age") |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  ForEach-Object {
    Write-Host "Purgando $($_.Name)"
    Remove-Item $_.FullName, "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
  }

Write-Host "Backup listo: $Dump"
