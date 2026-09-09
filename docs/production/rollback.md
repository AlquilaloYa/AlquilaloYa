# Rollback e incidentes

## Rollback de aplicación

1. Detener el despliegue nuevo sin borrar la base de datos.
2. Volver a la imagen o commit anterior conocido.
3. Mantener migraciones compatibles hacia atrás; nunca eliminar columnas usadas por la versión anterior durante un rollback.
4. Verificar `/api/health`, login, lectura de contratos y descarga de un PDF.
5. Registrar causa, duración, impacto y decisión de rollback.

## Rollback de base de datos

No se ejecutan migraciones destructivas como parte de un rollback automático. Restaurar un backup en una base separada y realizar migración de datos revisada.

## Incidente

Clasificar como disponibilidad, integridad documental, seguridad o proveedor externo. Preservar logs, congelar cambios, revocar secretos comprometidos y registrar el incidente sin incluir tokens o credenciales.
