# Resumen de trabajo por producto

**Actualizado:** 30 de octubre de 2026  
**Alcance:** estado verificable en el repositorio de ERP, app Android FieldOps,
sitio público Monoespacios 20 m² y portal del cliente.

Este documento consolida las funciones que ya están representadas en el código y
la documentación. Distingue los cambios hechos para el flujo Android en esta
sesión de las funciones existentes en los otros módulos; no implica que todos
los componentes estén desplegados en producción.

## Resumen ejecutivo

| Producto | Qué incluye | Estado relevante |
| --- | --- | --- |
| ERP | Gestión de contratos y clientes, RR. HH., operaciones y órdenes de mantenimiento, APIs y acceso por roles. | La sesión amplió las APIs de órdenes para el flujo diagnóstico/evidencia Android. Requiere aplicar la migración nueva y desplegar el backend. |
| FieldOps Android | App Capacitor para que el personal consulte y atienda órdenes, registre visitas, diagnóstico, materiales, evidencia y cierre. | Se ajustó el flujo y se generó un APK debug de prueba. |
| Monoespacios 20 m² | Sitio público de catálogo y mapa de unidades en Angamos y Benavides, más panel administrativo. | El repositorio documenta las fases 1–8 como completadas; las tareas de despliegue productivo siguen dependiendo de configuración externa. |
| Portal del cliente | Acceso privado para reportar incidencias, proponer horarios, adjuntar evidencia, seguir órdenes, recibir avisos y conversar con mantenimiento. | Funcionalidad presente en la app web y sus APIs; es distinta de la app del trabajador. |

## 1. ERP

### Funciones principales documentadas

- Módulos internos de contratos, clientes, pagos y cobranza, disponibilidad,
  RR. HH., agenda, marketing, integraciones y administración.
- Panel de operaciones para crear órdenes, asignar personal de mantenimiento,
  consultar estados e historial, administrar visitas, materiales y evidencias.
- Control de acceso por roles y permisos; las APIs autenticadas del ERP sirven
  como backend de FieldOps y del portal cliente.
- Evidencia de órdenes guardada en almacenamiento privado, no en un directorio
  público.

Referencias: [documentación general del ERP](./docs/ERP.md), [panel de operaciones](./apps/web/src/app/operaciones/page.tsx) y [rutas de órdenes](./apps/web/src/app/api/operaciones/ordenes).

### Cambios del backend realizados en esta sesión

- Se acepta el diagnóstico sin exigir que el campo descriptivo tenga contenido;
  la aplicación sigue exigiendo evidencia multimedia para guardarlo.
- El tiempo de trabajo comienza al guardar el diagnóstico, no al confirmar la
  llegada. El tiempo real de cierre toma ese inicio como referencia.
- El cierre ya no requiere registrar un tiempo estimado.
- La evidencia admite imágenes JPG, PNG y WebP, además de videos MP4 y WebM, y
  permite una descripción vacía.
- El tamaño máximo del video se fijó en 50 MB. Se amplió el límite del bucket y
  de la columna de adjuntos para que el almacenamiento no rechace estos archivos.
- Se añadió la migración
  [`20261030103000_expand_work_order_video_evidence.sql`](./supabase/migrations/20261030103000_expand_work_order_video_evidence.sql).

**Pendiente para producción:** aplicar esta migración a Supabase y desplegar el
backend con los cambios de las rutas de órdenes y evidencias.

## 2. App Android FieldOps

La app está implementada con React y Capacitor. Autentica contra el ERP y usa
sus APIs para cargar y actualizar órdenes, visitas, materiales y adjuntos.
Incluye inicio, tareas, visitas, calendario, avisos y perfil.

### Cambios del flujo de mantenimiento

- Se unificaron **Diagnóstico** y **Recursos y trabajo** en la pestaña
  **Diagnóstico y mantenimiento**.
- Se retiraron los campos **Problema encontrado** y **Causa probable**; la
  descripción del diagnóstico quedó como opcional.
- Se conservó la decisión **¿Puede resolverse hoy?**.
- Se pueden seleccionar fotos y videos; la evidencia se sube automáticamente al
  guardar el diagnóstico. Ya no hay un botón separado para adjuntar la foto.
- La app limita a **1 minuto** la duración de cada video seleccionado. La
  duración se verifica en el dispositivo antes de agregarlo.
- Los materiales requeridos y la opción **No se requieren materiales para esta
  orden** permanecen en la misma pestaña. Se quitó el campo de tiempo estimado.
- El contador comienza cuando se guarda el diagnóstico.
- En **Resolución, evidencia y cierre** se puede indicar si hace falta una nueva
  visita, elegir su fecha y horario, redactar instrucciones y adjuntar una
  evidencia final de foto o video con descripción opcional.
- El botón de acción presenta **Adjuntar nueva visita** cuando se solicita una
  cita; de lo contrario, permite **Finalizar tarea** al completar los requisitos.

El límite de un minuto se aplica en el cliente Android; el backend valida el
formato y tamaño del archivo, pero no analiza su duración.

Referencias: [código de FieldOps](./apps/fieldops-mobile/src/App.jsx),
[adaptador de API](./apps/fieldops-mobile/src/fieldops-api.js) y
[guía de FieldOps](./apps/fieldops-mobile/README.md).

### APK generado

- Tipo: APK **debug** de prueba, no es un APK release firmado para distribución.
- Archivo: [`app-debug.apk`](./apps/fieldops-mobile/android/app/build/outputs/apk/debug/app-debug.apk).
- Paquete Android: `com.alquilaya.fieldops`; versión `1.0.3` (código `4`).
- URL del ERP incluida en la compilación: `https://alquilaloya.vercel.app`.
- Tamaño aproximado: 6 MB.
- SHA-256: `5BBD79B5BCBDADCD2E9BB50CBBF40495C1A8D554EECFCC820AA6C22233ACC989`.

La app y el APK se compilaron localmente. **No se hizo commit ni push.**

## 3. Sitio web de Monoespacios 20 m²

El subproyecto vive en [`monoespacios-20m2/`](./monoespacios-20m2/) y contiene
una SPA pública y un panel administrativo separados del ERP principal.

### Sitio público

- Catálogo de mini departamentos de 20 m² en las zonas Angamos y Benavides.
- Filtros de zona, precio y características; ordenamiento y búsqueda desde la
  API.
- Fichas individuales con galería, características, precios, mapa y contacto
  por WhatsApp.
- Favoritos persistidos localmente, mapa interactivo, diseño adaptable y
  componentes de carga, error y ausencia de resultados.
- SEO por ficha, metadatos, sitemap y robots; accesibilidad con navegación por
  teclado y soporte de movimiento reducido.
- Disponibilidad sincronizada desde el ERP: contratos vigentes tienen prioridad
  como ocupados; también se reflejan mantenimiento y bloqueos. El sitio conserva
  el último estado conocido si el ERP no responde.

### API y administración

- API pública de consulta para zonas, listado filtrable y detalle de unidades.
- Panel `/admin` con autenticación, permisos de administrador, edición de
  propiedades, gestión de imágenes, orden y textos alternativos, auditoría y
  configuración del sitio.
- Base PostgreSQL en Supabase y API Express desplegable junto con el frontend.

Referencias: [README de Monoespacios](./monoespacios-20m2/README.md),
[entregable final](./monoespacios-20m2/docs/ENTREGABLE-FINAL.md),
[QA](./monoespacios-20m2/docs/QA.md) y
[despliegue](./monoespacios-20m2/docs/DEPLOYMENT.md).

La documentación de ese subproyecto registra las fases 1–8 como completadas.
Eso describe el alcance de desarrollo y sus verificaciones documentadas; no
confirma por sí mismo el estado actual de producción. La lista de QA mantiene
pendiente la verificación manual en dispositivos/navegadores y algunos pasos de
configuración y despliegue externo.

## 4. Portal del cliente

El portal web (`/portal-cliente`) es el canal privado de residentes y está
integrado con las órdenes de mantenimiento del ERP.

- Inicio de sesión con código de departamento y contraseña; el acceso se asocia
  a la cuenta del cliente y a un contrato vigente.
- Alta de reportes con tipo de problema, descripción, disponibilidad para la
  visita, indicación de si el cliente estará presente y hasta cinco archivos.
- Fotos JPG/PNG/WebP y videos MP4/WebM de hasta 8 MB cada uno; carga directa a
  almacenamiento privado mediante URL firmada.
- Selector para proponer tres ventanas de visita y acceso rápido a WhatsApp
  cuando la incidencia requiere atención urgente.
- Consulta del estado, historial y archivos de las solicitudes y órdenes.
- Notificaciones consultables, actualización periódica y acción para marcarlas
  como leídas.
- Chat con mantenimiento cuando corresponda; los mensajes se cifran al
  persistirlos. El chat se habilita según presencia del cliente, llegada del
  personal y estado de la orden.
- Las solicitudes quedan pendientes de revisión y pueden ser derivadas por el
  personal a una orden de trabajo.

Referencias: [portal web](./apps/web/src/app/portal-cliente/page.tsx),
[inicio de sesión](./apps/web/src/app/portal-cliente/login/page.tsx),
[API de reportes](./apps/web/src/app/api/portal-cliente/ordenes/route.ts),
[carga de archivos](./apps/web/src/app/api/portal-cliente/uploads/route.ts),
[chat](./apps/web/src/app/api/portal-cliente/ordenes/[id]/chat/route.ts) y
[notificaciones](./apps/web/src/app/api/portal-cliente/notificaciones/route.ts).

El límite de video de **1 minuto** descrito para FieldOps Android no se aplica
actualmente al portal cliente; allí el límite verificado es de 8 MB por archivo.

## 5. Verificación y siguientes pasos

En esta sesión se ejecutaron y aprobaron:

- `corepack pnpm --filter fieldops-mobile build`
- `corepack pnpm --filter fieldops-mobile lint`
- `corepack pnpm --filter @contract/web typecheck`
- Compilación Android `assembleDebug` y verificación del APK generado.

Antes de habilitar los videos de FieldOps en producción:

1. Aplicar la migración de Supabase indicada arriba.
2. Desplegar las APIs actualizadas del ERP.
3. Probar carga, reproducción y cierre con video en Android y verificar la
   programación de una visita de seguimiento en el entorno correspondiente.
4. Si se distribuirá fuera de pruebas, generar el APK/AAB **release** firmado
   con la clave de publicación de la organización.
