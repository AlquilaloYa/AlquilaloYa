# Firma electrónica

La firma electrónica requiere un proveedor aprobado y una revisión legal previa. SHA-256 solo verifica integridad; no es una firma.

## Contrato del conector

El proveedor debe implementar:

```text
createSigningRequest
getSigningStatus
cancelSigningRequest
```

## Flujo

```text
EMITIDO -> PENDIENTE_FIRMA -> solicitud externa -> webhook -> FIRMADO
```

La solicitud debe referenciar el `contractId`, el `documentId` y el `sha256` del PDF inmutable. La evidencia recibida del proveedor se guarda como metadata protegida y se registra en auditoría.

## Requisitos antes de activar

- proveedor y jurisdicción aprobados;
- credenciales OAuth/API almacenadas cifradas;
- webhook autenticado, con timestamp e idempotencia;
- pruebas de rechazo, cancelación y expiración;
- conservación del documento original y de la evidencia;
- revisión legal de retención y validez.
