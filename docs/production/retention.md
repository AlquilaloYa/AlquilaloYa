# Retención

Estas reglas son una configuración operativa inicial y deben validarse con asesoría legal local antes de producción.

| Recurso | Regla inicial |
| --- | --- |
| Contratos | Conservar mientras exista obligación contractual y durante el plazo legal aplicable. |
| Snapshots | Inmutables; nunca eliminar automáticamente junto con datos maestros. |
| Documentos PDF | No eliminar automáticamente; conservar cada versión histórica. |
| Auditoría | Retener durante el plazo legal aplicable; acceso solo con `audit.read`. |
| Actividad | Retener durante el plazo operativo/legal definido. |
| Integraciones y webhooks | Retener logs y errores el tiempo necesario para trazabilidad e incidentes. |

Las eliminaciones deben ser explícitas, autorizadas, auditadas y nunca deben romper referencias históricas.
