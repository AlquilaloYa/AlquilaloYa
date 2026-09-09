# Backup de la base de datos (Fase 8 - DR) para Windows/PowerShell.
# Requiere pg_dump en PATH (instalador de PostgreSQL) y DATABASE_URL definida.
# Uso:  $env:DATABASE_URL="..."; .\scripts\backup.ps1 [dir_salida]
$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "Debe definirse DATABASE_URL" }
$OutDir = if ($args.Count -ge 1) { $args[0] } else { "backups" }
$Keep = if ($env:BACKUP_RETENTION) { [int]$env:BACKUP_RETENTION } else { 14 }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Ts = Get-Date -Format "yyyyMMdd-HHmmss"
$Dump = Join-Path $OutDir "contract-$Ts.dump"

Write-Host "Volcando base de datos a $Dump ..."
& pg_dump $env:DATABASE_URL --format=custom --compress=6 --no-owner --no-privileges --file=$Dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo ($LASTEXITCODE)" }

$Hash = (Get-FileHash $Dump -Algorithm SHA256).Hash.ToLower()
"$Hash  $(Split-Path $Dump -Leaf)" | Set-Content -NoNewline "$Dump.sha256"

# Retencion: conservar los $Keep dumps mas recientes.
Get-ChildItem (Join-Path $OutDir "contract-*.dump") |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep |
  ForEach-Object {
    Write-Host "Purgando $($_.Name)"
    Remove-Item $_.FullName, "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
  }

Write-Host "Backup listo: $Dump"
