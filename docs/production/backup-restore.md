# Backup y restore

## Objetivos

- RPO objetivo: 24 horas como máximo hasta habilitar backups más frecuentes.
- RTO objetivo: 4 horas.
- Base de datos, Storage y Redis se respaldan por separado.

## Backup

1. Activar backups automáticos de Supabase para la base de datos.
2. Mantener Storage privado y conservar objetos PDF históricos.
3. Redis usa AOF para recuperación operativa, pero no es la fuente de verdad.
4. Registrar fecha, alcance y resultado de cada backup.

## Restore

1. Crear un proyecto Supabase de recuperación.
2. Restaurar la base de datos y aplicar migraciones pendientes.
3. Restaurar Storage conservando las claves de documentos.
4. Crear Redis vacío y permitir que los jobs reintentables se vuelvan a encolar.
5. Configurar secretos de recuperación, nunca copiar secretos desde el cliente.
6. Ejecutar `GET /api/health` y una descarga de documento histórico.
7. Documentar el tiempo real y cualquier pérdida dentro del RPO.

## Prueba

El restore se prueba al menos trimestralmente con datos no productivos o una copia protegida. No se considera válido hasta verificar el SHA-256 de un documento restaurado.
