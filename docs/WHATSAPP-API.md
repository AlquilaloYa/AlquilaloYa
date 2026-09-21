# API de WhatsApp Business (checklist)

Guía práctica para obtener y configurar los datos que usa el módulo de Marketing
(bandeja de mensajes, bots y despacho saliente).

## Qué necesita el sistema

| Dato | Variable en el conector | Formato |
|------|--------------------------|---------|
| Phone Number ID | `phoneNumberId` (config) | `1138...` (numérico) |
| Token de acceso | `token` (credencial, cifrada) | `EAAG...` (el token largo) |
| Versión API | `apiVersion` (config) | `v20.0` (predeterminado) |

Sin estos dos primeros el envío marca `FALLO` en la bandeja a propósito: avisa que no hay canal realmente conectado.

## Checklist: pasos en Meta

### 1. Cuenta de desarrollador
- [ ] Entrar a https://developers.facebook.com e iniciar sesión con la cuenta de Facebook que administra el negocio.
- [ ] Aceptar las políticas de desarrollador de Meta.

### 2. Crear la app
- [ ] **Mis apps → Crear app**.
- [ ] Elige **Empresa** como tipo de app (Business).
- [ ] Completa los datos y crea. (Si no tienes Business Manager, te guiará a crear uno.)

### 3. Agregar el producto WhatsApp
- [ ] Dentro de la app → menú **Agregar productos** → **WhatsApp** → **Configurar**.

### 4. Obtener los datos
- [ ] En **WhatsApp → Configuración de la API**:
  - **Phone Number ID**: aparece junto al número registrado (similar a `123456789012345`).
  - **Token de acceso**: pestaña/opción **Estadísticas y uso** o el selector de token junto al número → **Generar token permanente** (elige "PM del sistema de negocio"). Copia el que empieza con `EAAG...`.
  - **Número de WhatsApp**: el que recibirá/enviará mensajes. Verifícalo (código por SMS/llamada).
- [ ] Opcional: con el **número de prueba** que da Meta (`+1 5550123456`) alcanza para probar; solo responde a contactos agregados.
- [ ] Para producción: usa un **número de negocio verificado** de WhatsApp Business.

### 5. Configurar en el ERP
- [ ] Ir a **Integraciones → WhatsApp Business → Configurar**.
- [ ] Pegar **Phone Number ID** y **Token** → **Guardar**.
- [ ] Pulsar **Probar**: debe responder sin error (valida número y token contra Meta).
- [ ] Desde **Bandeja de mensajes**, responder a una conversación WhatsApp: el mensaje debe salir `ENVIADO`.

## Reglas de la API (WhatsApp Cloud API)

- **Ventana de 24 h**: solo puedes enviar mensajes libres dentro de las 24 h
  posteriores al último mensaje entrante del usuario.
- **Plantillas (templates)**: fuera de la ventana de 24 h o para campañas solo se
  permiten plantillas aprobadas (`template`). El adaptador ya las soporta.
- **Costos**: los envíos de plantillas se facturan por mensaje; los de conversación
  dentro de la ventana tienen costo por conversación, según la tarifa de WhatsApp
  (categoría utilidad/autenticación/marketing).

## Verificación de credenciales en el sistema

El botón **Probar** de Integraciones ejecuta una llamada real de verificación contra
Meta (`WhatsAppAdapter.testConnection`), por lo que confirma que `phoneNumberId` y
`token` cargan correctamente desde las credenciales cifradas antes de despachar.

Los despachos usan el `accessToken` descifrado de las credenciales del conector
(no se reenvía el token en cada payload), y se registran en la tabla `connector_logs`.