# Backup y restore

## Objetivos

- **RPO objetivo:** hasta 24 horas mediante copia diaria, sujeto a que el workflow termine correctamente.
- **RTO objetivo:** hasta 1 hora; pendiente de demostración en simulacro.
- Respaldar PostgreSQL y todos los buckets de Supabase Storage. Redis se reconstruye y no es fuente de verdad.
- Los runbooks detallados, variables requeridas, claves, restauración y limitaciones están en [BACKUP-DR.md](../BACKUP-DR.md).

## Controles

1. El workflow diario de GitHub Actions produce dumps cifrados con `age` y SHA-256 antes de cargarlos como artefactos (30 días).
2. Mantener la clave privada `age` offline y separada de GitHub/Supabase; Actions solo conserva el destinatario público.
3. Revisar el estado de cada ejecución y alertar sobre fallos para no exceder el RPO.
4. Mantener una segunda copia cifrada e inmutable fuera de GitHub con credenciales independientes. **Este destino externo todavía no está configurado**; los artefactos de Actions pueden ser eliminados por un administrador de la cuenta.
5. Mantener Storage privado cuando corresponda y conservar documentos históricos.

## Recuperación

1. Declarar incidente, congelar cambios y evitar escrituras concurrentes.
2. Crear un proyecto de recuperación aislado.
3. Descargar los artefactos, comprobar SHA-256 y descifrar con la clave custodiada.
4. Restaurar PostgreSQL y Storage con los procedimientos de [BACKUP-DR.md](../BACKUP-DR.md).
5. Configurar secretos de recuperación; nunca copiarlos desde el cliente.
6. Ejecutar las verificaciones de datos, `GET /api/health`, login y descarga de documentos históricos.
7. Registrar tiempo real, integridad verificada y pérdida de datos respecto al RPO.

No restaurar una copia sobre producción hasta verificarla en aislamiento y autorizar explícitamente el cambio.
