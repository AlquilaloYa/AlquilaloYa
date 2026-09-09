# Actualizaciones de Tauri

## Distribución

- Generar instaladores NSIS desde `apps/desktop/src-tauri`.
- Firmar el instalador con el certificado de la organización.
- Publicar versión, checksum y notas de cambio en el canal interno.
- Distribuir solo a PCs autorizadas.

## Actualización

1. Probar el instalador en staging.
2. Verificar que la aplicación no contiene secretos permanentes.
3. Publicar gradualmente a un grupo piloto.
4. Confirmar conexión HTTPS con el backend y compatibilidad de API.
5. Ampliar la distribución tras verificar logs y errores.
6. Mantener el instalador anterior para rollback.

La aplicación Tauri no debe contener `SUPABASE_SERVICE_ROLE_KEY`, credenciales de conectores ni `CONNECTOR_ENCRYPTION_KEY`.
