# Create an encrypted off-device recovery set: PostgreSQL, Supabase Storage, and Git refs.
# Usage: .\scripts\backup-recovery.ps1 E:\AlquilaYa-Backups
$ErrorActionPreference = "Stop"

if ($args.Count -lt 1) {
  throw "Indica un directorio de respaldo externo, por ejemplo E:\AlquilaYa-Backups"
}
foreach ($name in @("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_AGE_RECIPIENT")) {
  if (-not [Environment]::GetEnvironmentVariable($name)) {
    throw "Debe definirse la variable $name"
  }
}
foreach ($tool in @("git", "age", "pg_dump", "node")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Se requiere $tool en PATH"
  }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutDir = [System.IO.Path]::GetFullPath($args[0])
$RepoPrefix = $RepoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($OutDir.StartsWith($RepoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Guarda el respaldo fuera del repositorio, idealmente en un disco externo."
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$env:BACKUP_RETENTION = if ($env:BACKUP_RETENTION) { $env:BACKUP_RETENTION } else { "14" }
$GitBundle = Join-Path $OutDir "source-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')).bundle"
$EncryptedBundle = "$GitBundle.age"
$TempBundle = Join-Path ([System.IO.Path]::GetTempPath()) "alquilaya-$([Guid]::NewGuid().ToString('N')).bundle"

try {
  & (Join-Path $PSScriptRoot "backup.ps1") $OutDir
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "El respaldo PostgreSQL falló ($LASTEXITCODE)" }

  & node (Join-Path $PSScriptRoot "backup-storage.mjs") $OutDir
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "El respaldo Storage falló ($LASTEXITCODE)" }

  Push-Location $RepoRoot
  try {
    $DirtyFiles = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar el estado de Git" }
    if ($DirtyFiles.Count -gt 0) {
      Write-Warning "El repositorio tiene cambios sin commit; el bundle incluirá solo commits y refs existentes, no esos cambios."
    }

    & git bundle create $TempBundle --all
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el bundle de Git ($LASTEXITCODE)" }
    & git bundle verify $TempBundle
    if ($LASTEXITCODE -ne 0) { throw "El bundle de Git no pasó la verificación ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }

  & age --encrypt --recipient $env:BACKUP_AGE_RECIPIENT --output $EncryptedBundle $TempBundle
  if ($LASTEXITCODE -ne 0) { throw "No se pudo cifrar el bundle de Git ($LASTEXITCODE)" }
  $Hash = (Get-FileHash $EncryptedBundle -Algorithm SHA256).Hash.ToLower()
  "$Hash  $(Split-Path $EncryptedBundle -Leaf)" | Set-Content -Encoding ascii -NoNewline "$EncryptedBundle.sha256"

  Get-ChildItem (Join-Path $OutDir "source-*.bundle.age") |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip ([int]$env:BACKUP_RETENTION) |
    ForEach-Object {
      Remove-Item $_.FullName, "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
    }

  Write-Host "Respaldo de recuperación completado en $OutDir"
  Write-Host "Mantén el disco desconectado cuando termine y guarda la clave privada age por separado."
} catch {
  Remove-Item $EncryptedBundle -Force -ErrorAction SilentlyContinue
  Remove-Item "$EncryptedBundle.sha256" -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item $TempBundle -Force -ErrorAction SilentlyContinue
}
