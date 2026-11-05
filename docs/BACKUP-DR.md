# Copias de seguridad y recuperación ante pérdida de datos

## Objetivos y alcance

- **RPO objetivo:** hasta 24 horas. El flujo diario no garantiza este objetivo si falla; revisar el resultado de cada ejecución.
- **RTO objetivo:** hasta 1 hora, aún no demostrado mediante un simulacro cronometrado.
- **Frecuencia:** diaria a las 03:00 UTC y bajo demanda (`.github/workflows/backup.yml`).
- **Retención:** 14 copias en el directorio local (configurable con `BACKUP_RETENTION`), 30 días en artefactos de GitHub Actions y copias con nombre único en Google Drive.
- **Incluye:** PostgreSQL completo y objetos de todos los buckets de Supabase Storage, con metadatos de bucket, claves, tamaño y SHA-256 por objeto.

Redis no es la fuente de verdad: se reconstruye y se vuelven a encolar los trabajos reintentables. Las variables de entorno, claves de cifrado, configuración DNS y configuración del proveedor no forman parte del dump; deben mantenerse en el gestor de secretos y en el inventario de recuperación de la organización.

## Cifrado y custodia de claves

Los archivos de base de datos y Storage se cifran con `age` antes de subirlos a GitHub. El workflow solo recibe la **clave pública**; no necesita la clave privada para generar copias.

1. En un equipo confiable con `age` instalado, generar una clave:

   ```bash
   age-keygen -o alquilaya-backup.agekey
   ```

2. Guardar la clave privada `AGE-SECRET-KEY-...` fuera del repositorio y de GitHub Actions: mantener una copia offline protegida y una segunda copia bajo custodia separada, con acceso de emergencia controlado.
3. Registrar el destinatario `age1...` que imprime `age-keygen` como variable de Actions `BACKUP_AGE_RECIPIENT`.
4. Configurar como **secrets** de Actions: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `RCLONE_CONFIG` (configuración de rclone con autorización a la cuenta/carpeta dedicada de Drive).
5. Configurar como **variables** de Actions: `BACKUP_AGE_RECIPIENT` y `RCLONE_DRIVE_PATH`, por ejemplo `gdrive:AlquilaYa/DR`.
6. Restringir quién puede modificar `main`, los workflows y los secretos. No ejecutar el flujo desde cambios de pull request no confiables.

No enviar la clave privada por chat, correo, tickets, repositorios ni variables de Actions. Si se pierde esa clave, los respaldos cifrados no se pueden recuperar. Para rotarla, cambiar el destinatario y comprobar que una copia nueva se descifra con la nueva clave antes de retirar la anterior.

> **Límite contra ransomware o toma de cuentas:** cifrar los artefactos protege su confidencialidad, pero un administrador con control de GitHub podría borrar los artefactos o modificar el workflow; 30 días de retención tampoco sustituyen una copia inmutable. El script local permite una copia fuera de línea si se desconecta el medio, pero no la automatiza ni la replica en otra nube. Aún se requiere una segunda copia cifrada en almacenamiento independiente con retención inmutable/Object Lock y credenciales separadas. Esa réplica externa no está configurada por este flujo.

## Ejecución y comprobaciones

GitHub Actions ejecuta `pg_dump` en formato custom, `scripts/backup-storage.mjs` y un `git bundle` completo del código; los tres artefactos se cifran y acompañan de checksum SHA-256. Se suben a GitHub Actions por 30 días y se replican en una carpeta única de Google Drive. El flujo valida las variables críticas y falla con un mensaje explícito si falta configuración; solo publica archivos `.age` y `.sha256`.

Para configurar Drive, instalar rclone en un equipo de confianza, crear y probar un remote llamado `gdrive` con una cuenta dedicada o una carpeta restringida, y guardar el contenido completo del archivo `rclone.conf` como secreto `RCLONE_CONFIG`. Guardar `gdrive:AlquilaYa/DR` (o la ruta elegida) como variable `RCLONE_DRIVE_PATH`. `rclone.conf` contiene un token OAuth de Drive: no subirlo al repositorio ni compartirlo. La cuenta autorizada debe tener cuota suficiente.

Drive añade una copia en otra plataforma, pero **Google Drive no es inmutable por defecto**. Restringir quién controla la cuenta, activar retención/recuperación administrativa disponible en el plan y mantener además una copia desconectada. Un atacante con control de las credenciales de Drive podría eliminar la réplica.

La copia de Storage recorre los objetos vigentes mientras se ejecuta; no es una instantánea transaccional junto con PostgreSQL. Un cambio concurrente puede hacer que ambas copias representen instantes ligeramente distintos. Si la cantidad de datos supera los límites o la cuota de artefactos de GitHub, la ejecución debe considerarse fallida y hace falta configurar un destino de backup independiente.

Después de configurar los secretos y la variable:

1. Ejecutar **Actions → Encrypted DR Backup → Run workflow**.
2. Confirmar que la ejecución termina en verde y que incluye tres archivos cifrados (base de datos, Storage y código) más sus checksums.
3. Confirmar que la carpeta de Drive contiene los archivos del `run_id` y que tamaños y SHA-256 coinciden con el artefacto de Actions.
4. Revisar y alertar sobre fallos diarios; una ejecución sin copia verificada en Drive no cuenta como respaldo externo para el RPO.

También se puede crear una copia local en Linux/macOS/WSL:

```bash
DATABASE_URL="..." BACKUP_AGE_RECIPIENT="age1..." bash scripts/backup.sh backups
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." BACKUP_AGE_RECIPIENT="age1..." \
  node scripts/backup-storage.mjs backups
```

En Windows, instalar `pg_dump`, `age` y Node.js 20 o posterior. El script PowerShell crea el respaldo de PostgreSQL:

```powershell
$env:DATABASE_URL="..."
$env:BACKUP_AGE_RECIPIENT="age1..."
.\scripts\backup.ps1 backups
```

El backup de Storage requiere Node.js 20 y `age`; puede ejecutarse con las mismas variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `BACKUP_AGE_RECIPIENT`.

Para una copia local que también permita recuperar el código fuente, usar un disco externo y ejecutar desde PowerShell:

```powershell
$env:DATABASE_URL="..."
$env:SUPABASE_URL="https://<proyecto>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:BACKUP_AGE_RECIPIENT="age1..."
.\scripts\backup-recovery.ps1 E:\AlquilaYa-Backups
```

El script crea copias cifradas de PostgreSQL, Storage y un `git bundle` con los commits y refs. No respalda `.env` ni incluye cambios sin commit. Verifica los cambios con Git, guarda la copia fuera del equipo de producción y desconecta el disco tras completarla; un disco siempre conectado también puede ser cifrado por ransomware. Se requiere suficiente espacio temporal y disponibilidad de la base y Storage. Para recuperar el código, descifra `source-*.bundle.age` con la clave privada y ejecuta `git clone <archivo.bundle> carpeta-recuperada`.

## Recuperación de PostgreSQL

Descargar el artefacto `encrypted-dr-backup-<run_id>` desde la ejecución de backup. Hacer la primera restauración en una base **aislada**, nunca directamente sobre producción.

Linux/macOS/WSL:

```bash
export DATABASE_URL="postgres://.../base-aislada"
export BACKUP_AGE_IDENTITY="/ruta-segura/alquilaya-backup.agekey"
bash scripts/restore.sh backups/contract-<fecha>.dump.age --yes
```

Windows PowerShell:

```powershell
$env:DATABASE_URL="..."
$env:BACKUP_AGE_IDENTITY="C:\ruta-segura\alquilaya-backup.agekey"
.\scripts\restore.ps1 backups\contract-<fecha>.dump.age
```

El restore verifica SHA-256 si está disponible, descifra en un archivo temporal y solicita confirmación porque `pg_restore --clean` sobrescribe objetos de la base destino. Los archivos temporales se eliminan al terminar.

## Recuperación del código fuente

Descargar `source-<commit>.bundle.age` de GitHub Actions o Google Drive. En un equipo de recuperación con Git y `age`:

```bash
age --decrypt --identity /ruta-segura/alquilaya-backup.agekey \
  --output alquilaya.bundle source-<commit>.bundle.age
git bundle verify alquilaya.bundle
git clone alquilaya.bundle alquilaya-recuperado
```

El bundle contiene commits y refs de Git, no `.env`, secretos del proveedor, cambios locales sin commit ni datos runtime. Reinstalar dependencias desde los lockfiles y reconfigurar secretos desde su gestor independiente.

## Recuperación de Supabase Storage

Con el archivo `storage-<fecha>.tar.gz.age` y su `.sha256`, apuntar las variables a un proyecto de recuperación aislado. La clave privada debe estar disponible localmente; el proceso nunca la carga a Actions.

```bash
SUPABASE_URL="https://<proyecto-recuperacion>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
BACKUP_AGE_IDENTITY="/ruta-segura/alquilaya-backup.agekey" \
  node scripts/restore-storage.mjs backups/storage-<fecha>.tar.gz.age
```

El script valida el checksum, la estructura del archivo y el SHA-256 de cada objeto antes de subirlo. Crea los buckets que falten y sube con `upsert`; **no elimina** objetos que existían solo en el destino. Por seguridad, los buckets públicos del respaldo se crean privados de forma predeterminada. Solo preservar buckets públicos tras revisar el impacto y definir `RESTORE_ALLOW_PUBLIC_STORAGE_BUCKETS=true`. El script también se detiene si encuentra un bucket privado del respaldo configurado como público en el destino. Preferir un proyecto vacío. Aplicar por separado las políticas/RLS, configuración del proyecto y secretos requeridos por la app.

## Simulacro trimestral

Un artefacto generado no prueba que la recuperación funcione. Cada trimestre y después de cambiar claves o formatos:

1. Descargar los tres artefactos de una ejecución exitosa.
2. Verificar SHA-256, descifrar y restaurar PostgreSQL y Storage en proyectos aislados; verificar el `git bundle`.
3. Ejecutar `node scripts/verify-restore.mjs` con `DATABASE_URL` apuntando a la base aislada.
4. Descargar un documento histórico restaurado y comparar su SHA-256 con el valor registrado en la base; probar también una imagen/voucher y el acceso de la app.
5. Medir el tiempo total de recuperación. Registrar la fecha, el resultado y cualquier brecha respecto al RPO/RTO.
6. Confirmar que el procedimiento de emergencia puede obtener la clave privada sin depender de la cuenta de GitHub o Supabase comprometida.

## Registro de simulacros

| Fecha | Copia/run | DB  | Storage | Tiempo | Responsable                  |
| ----- | --------- | --- | ------- | ------ | ---------------------------- |
| —     | —         | —   | —       | —      | (pendiente primer simulacro) |
