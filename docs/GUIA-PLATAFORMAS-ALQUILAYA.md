# AlquilaYa: guia detallada de plataformas

**Fecha de referencia:** 3 de noviembre de 2026

**Revision del codigo:** `1f1a467`
**Alcance:** ERP web, sitio comercial de MiniDepas, administracion de contenido, app Android AlquilaYa Repair / FieldOps y portal de mantenimiento para clientes.

Esta guia explica que hace cada plataforma, como se relacionan y donde se encuentran sus componentes en este monorepo. Complementa [`ERP.md`](./ERP.md), [`DEPLOY.md`](./DEPLOY.md) y [`BACKUP-DR.md`](./BACKUP-DR.md). Se ha redactado a partir del codigo y configuracion presentes en el repositorio; no implica que todos los conectores, cuentas externas o variables de produccion esten habilitados.

## 1. Resumen ejecutivo

| Plataforma | Usuario principal | Para que sirve | Implementacion |
| --- | --- | --- | --- |
| ERP web | Administracion, operaciones, RR. HH., marketing y finanzas | Gestionar unidades, clientes, contratos, cobranza, mantenimiento y operacion interna | `apps/web`: Next.js, React y TypeScript |
| Panel de contenido web | Personal autorizado del ERP | Mantener fichas, fotos, textos y ajustes del sitio comercial | Pantalla del ERP que usa un proxy autenticado hacia la API administrativa del sitio |
| Sitio comercial publico | Personas que buscan alquilar | Consultar MiniDepas, filtrar por zona/precio/caracteristicas y contactar al equipo | Aplicacion independiente en `monoespacios-20m2`: React/Vite, API Express y Supabase |
| App Android | Tecnicos y personal de mantenimiento | Consultar y ejecutar ordenes de trabajo en campo | `apps/fieldops-mobile`: React, Vite y Capacitor Android |
| Portal de clientes | Residentes / clientes con contrato vigente | Reportar problemas y seguir la atencion de mantenimiento | Rutas Next.js `/portal-cliente` y APIs privadas |

Vista simplificada:

```text
Visitante -> SPA comercial -> API Express <-> PostgreSQL/Supabase del sitio
                                  |
                                  | consulta el estado publico
                                  v
ERP web (Next.js) <-> API ERP <-> PostgreSQL/Supabase del ERP
    |-- proxy autenticado ----------------> API admin del sitio
    |<-- APIs ERP <--- App Android
    +<-- APIs ERP <--- Portal cliente
```

La app Android y el portal no mantienen bases de datos de negocio separadas: consumen las APIs del ERP. El sitio comercial tiene su propia aplicacion, API y base de datos. El ERP valida al usuario y reenvia las operaciones del panel de contenido a la API administrativa del sitio; para disponibilidad, el sentido de sincronizacion es del ERP hacia el sitio comercial.

## 2. Arquitectura del repositorio

El proyecto usa un monorepo con pnpm workspaces y Turborepo. Las piezas mas relevantes para el ERP, Android, el portal y la integracion del sitio comercial son:

| Ruta | Responsabilidad |
| --- | --- |
| `apps/web` | ERP, APIs HTTP, autenticacion, portal cliente, proxy de contenido del sitio |
| `apps/fieldops-mobile` | Interfaz Android de mantenimiento y adaptador cliente para las APIs del ERP |
| `apps/worker` | Procesamiento en segundo plano, incluyendo trabajos de documentos y notificaciones segun la configuracion |
| `packages/db` | Esquemas Drizzle, acceso a PostgreSQL y repositorios |
| `packages/domain` | Reglas de negocio compartidas, roles, permisos y estados |
| `packages/validation` | Validaciones compartidas |
| `packages/ui` | Componentes visuales compartidos por aplicaciones web |
| `packages/integrations` | Adaptadores de servicios externos |
| `supabase/migrations` | Migraciones SQL de la base administrada por Supabase |
| `docs` | Documentacion tecnica, despliegue y continuidad operativa |

### Tecnologias

- **Web:** Next.js App Router, React, TypeScript y Tailwind CSS.
- **Android:** React, Vite, Capacitor 8 y proyecto Android nativo Gradle.
- **Datos:** PostgreSQL mediante Drizzle ORM.
- **Identidad:** Supabase Auth; la aplicacion mantiene tambien un registro de usuarios, roles y permisos en PostgreSQL.
- **Archivos:** Supabase Storage, usando buckets y URLs firmadas en los flujos que corresponden.
- **PDF:** generacion del lado servidor con Chromium/Puppeteer y utilidades PDF.
- **Build y calidad:** pnpm, Turborepo, TypeScript, ESLint/Vitest para web y Vite/Oxlint para FieldOps.

## 3. ERP web interno

### 3.1 Entrada y navegacion

- La raiz `/` muestra una portada sencilla de **AlquilaYa ERP** con acceso al login.
- `/login` inicia la sesion del personal.
- Una vez autenticado, `DashboardShell` presenta la barra superior, navegacion lateral, busqueda de comandos y notificaciones.
- La barra superior muestra el usuario, el tema, la campana y, para quien tiene acceso a contratos y departamentos, el acceso a **Exportar**.
- Las paginas comprueban el acceso en la interfaz para la experiencia de usuario; las APIs vuelven a autenticar y autorizan cada operacion en el servidor.

### 3.2 Modulos de negocio

Las rutas siguientes describen las areas implementadas en el ERP. El acceso concreto depende del rol y de permisos adicionales:

| Area | Pantallas principales | Uso |
| --- | --- | --- |
| Dashboard | `/dashboard` | Indicadores de portafolio, ocupacion, cobranza, vencimientos, incidencias y accesos a reportes |
| Disponibilidad | `/disponibilidad`, `/disponibilidad/[codigo]` | Consulta del estado y detalle de unidades |
| Departamentos | `/departamentos` | Administracion de unidades, datos de pago, precio y estados manuales |
| Clientes | `/clientes`, `/directorio`, `/contactos` | Gestion y consulta de clientes y contactos |
| Contratos | `/contratos`, `/contratos/[id]`, `/contrato-final` | Ciclo contractual, datos, emision y seguimiento |
| Adendas y plantillas | `/adendas`, `/plantillas` | Adendas y administracion de versiones de plantillas |
| Cobranza | `/pagos`, `/analiticas` | Cuotas, vouchers, saldos, estados y consultas de cobranza |
| Reportes de exportacion | `/exportaciones` | Libro Excel de pagos e inmuebles; filtros por mes, propietario, inmueble y estado |
| Workflow | `/workflow`, `/checklist`, `/work-123`, `/agenda` | Seguimiento de actividades, inspecciones, tareas y agenda |
| Operaciones | `/operaciones`, `/pedidos-clientes` | Bandeja de solicitudes y despacho de ordenes de mantenimiento |
| RR. HH. | `/rrhh`, `/cronograma-asistencia` | Expedientes, estructura, solicitudes, onboarding y asistencia |
| Marketing | `/pipeline`, `/mensajes`, `/chat-clientes`, `/automatizaciones` | Leads, conversaciones, bots y automatizaciones |
| Contabilidad | `/contabilidad/*` | Balance general, resultados, flujo financiero, analiticas y gastos |
| Contenido del sitio | `/contenido-web` | Propiedades comerciales, multimedia y configuracion editorial |
| Administracion | `/configuraciones/usuarios`, `/configuraciones/seguridad`, `/auditoria`, `/actividad`, `/integraciones` | Usuarios, MFA, registro de actividad, auditoria e integraciones |

Hay tambien pantallas para scoring de inquilinos, separaciones, servicios extras, Google SyS y funciones de soporte. Sus APIs y requisitos pueden revisarse en `apps/web/src/app` y `apps/web/src/app/api`.

### 3.3 Contratos, departamentos y cobranza

- **Departamentos:** cada unidad tiene codigo, nombre, numero, edificio/tipo, persona receptora del ingreso, precio, mantenimiento y estado operativo.
- **Clientes:** las personas se asocian a contratos y a un codigo de departamento.
- **Contratos:** vinculan cliente, departamento, fechas y condiciones economicas. Los documentos se construyen a partir de plantillas y datos contractuales.
- **Documentos:** el ERP genera documentos PDF y conserva sus metadatos y archivos en almacenamiento; algunas operaciones admiten verificacion de integridad.
- **Pagos:** cada cuota pertenece a un contrato y a un periodo. El registro conserva conceptos como alquiler, mantenimiento, penalidad, monto pagado, fecha de pago y estado.
- **Disponibilidad:** el ERP combina estado manual y contratos con fechas vigentes. Los valores operativos incluyen disponible, ocupado, mantenimiento y bloqueado.

Las cifras del dashboard y de reportes son vistas operativas construidas desde estos registros, no sustituyen la conciliacion contable ni una fuente bancaria.

### 3.4 Ordenes de trabajo y mantenimiento

El modulo de operaciones centraliza la solicitud, asignacion y seguimiento de intervenciones:

1. Se registra una incidencia con tipo, descripcion, ubicacion, sede, departamento y residente.
2. Operaciones asigna o reasigna la orden a personal activo de mantenimiento.
3. La orden progresa por estados de trabajo, visitas, diagnostico, estimacion, ejecucion y cierre.
4. Se registran materiales, cantidades, costos, observaciones y evidencia.
5. Se conserva el historial de eventos para reconstruir cambios y actores.
6. El portal cliente puede crear solicitudes; operaciones las revisa y puede convertirlas en orden de trabajo.
7. El tecnico actualiza la orden con la app FieldOps.

Los estados de las ordenes incluyen, entre otros, creada, asignada, aceptada, visita programada, en sitio, diagnostico, estimacion, en proceso, resuelta, pendiente de cierre, completada, bloqueada, rechazada, cancelada y reprogramada. Las transiciones permitidas se aplican en la API; no se debe asumir que cualquier cambio de estado es valido.

### 3.5 Exportacion a Excel

La pagina `/exportaciones` produce un archivo `.xlsx` con dos hojas:

- **Pagos:** mes/periodo, propietario o receptor, inquilino, inmueble, contrato, alquiler, mantenimiento, penalidad, total del periodo, monto pagado, saldo, fecha y estado.
- **Inmuebles:** codigo, nombre, piso, propietario, precio mensual, estado, inquilino actual y si la unidad esta activa.

Los filtros aplicados por el usuario son:

- Mes de los pagos; sin mes se consulta todo el historial.
- Propietario/persona receptora.
- Inmueble.
- Estado del pago.

El filtro de mes se aplica a la hoja **Pagos**. La hoja **Inmuebles** muestra el estado actual. El archivo incluye filtros de tabla para facilitar analisis en Excel. La API requiere `contract.read` y `department.read`; no retorna vouchers ni datos de autenticacion.

### 3.6 Roles y autorizacion

Los roles definidos por la aplicacion son:

| Rol | Perfil general |
| --- | --- |
| `DEVELOPER` | Administracion de la aplicacion y permisos |
| `ADMIN` | Administracion general |
| `RRHH` | Lectura operativa y capacidades especificas de RR. HH. |
| `ASISTENTE_ADMINISTRATIVO` | Lectura operativa, algunas capacidades de materiales y acceso de lectura a marketing |
| `MARKETING` | Acceso al area de marketing |
| `MANTENIMIENTO` | Lectura y actualizacion de ordenes de trabajo y registro de materiales |

La matriz de referencia vive en `packages/domain/src/rbac/role-permissions.ts`. El acceso puede ampliarse con permisos individuales por usuario. El servidor resuelve la sesion Supabase y busca que la cuenta ERP este activa antes de permitir el acceso.

### 3.7 Inicio de sesion y seguridad web

- Los tokens de sesion se almacenan en cookies `HttpOnly`; en produccion son `Secure`. Las cookies web normales usan `SameSite=Lax`.
- El middleware agrega cabeceras de seguridad, request ID, limitacion de peticiones a APIs y redireccion de paginas protegidas.
- La autenticacion de API se vuelve a verificar en `requireUser`; el encabezado de correo legado no sirve como identidad de autorizacion.
- MFA TOTP puede exigirse a `ADMIN` y `DEVELOPER` cuando `MFA_ENFORCE=true`. La politica y el estado configurado en el proveedor de autenticacion determinan si se solicita segundo factor.
- La opcion de MFA del usuario se administra en `/configuraciones/seguridad`.
- Las APIs sensibles deben ejecutar sus propias comprobaciones de permiso. Ocultar un boton en el frontend no constituye un control de acceso.

## 4. Sitio comercial y panel de contenido

### 4.1 Sitio independiente

El codigo del sitio comercial esta en `monoespacios-20m2/`, separado de la aplicacion Next.js del ERP. Su dominio de negocio son MiniDepas de 20 m2 en las zonas Angamos y Benavides. La ruta raiz `/` de `apps/web` sigue siendo la portada del ERP; no es el catalogo comercial.

| Componente | Ruta | Responsabilidad |
| --- | --- | --- |
| SPA comercial | `monoespacios-20m2/frontend` | Catalogo, filtros, mapa, fichas individuales, favoritos y contacto |
| Panel de administracion propio | `monoespacios-20m2/frontend/admin.html` | Gestion directa de propiedades y configuracion del sitio |
| API | `monoespacios-20m2/backend` y `monoespacios-20m2/api/index.mjs` | API Express/TypeScript, desplegada como funcion serverless |
| Base de datos | `monoespacios-20m2/supabase/migrations` | Esquema PostgreSQL en un proyecto Supabase propio, independiente del ERP |
| Despliegue | `monoespacios-20m2/vercel.json` | SPA estatica y API en Vercel, con tarea programada de disponibilidad |

### 4.2 Experiencia del sitio comercial

La SPA usa React 19, TypeScript, Vite, Tailwind CSS y Leaflet. La interfaz publica permite:

- Explorar fichas activas en las zonas Angamos y Benavides y ordenar por destacadas o precio.
- Filtrar por zona, mensualidad maxima y caracteristicas (amoblado, mascotas, ventanas, monoambiente y tipos de unidad).
- Ver tarjetas y un mapa con marcadores de precio; la seleccion de un marcador se coordina con la tarjeta correspondiente.
- Abrir una ficha propia por unidad con galeria, descripcion, precio, gastos, amenidades, mapa, estado y fecha estimada de disponibilidad.
- Guardar favoritos localmente en el navegador y consultar por WhatsApp desde las fichas y favoritos.
- Ver contenido editorial configurable, como textos de portada, contacto, etiquetas y metadatos SEO.

El dominio fija `surface_m2 = 20`; las zonas admitidas son Angamos y Benavides. La disponibilidad se expresa como `disponible`, `mantenimiento`, `ocupado` o `bloqueado`. Si la API no esta disponible, la SPA tiene datos demo y muestra el estado de demostracion; estos datos no reemplazan el catalogo de produccion.

### 4.3 API y datos del sitio

El backend usa Node.js (20 o superior), Express, TypeScript, Zod y PostgreSQL mediante `pg`. El frontend llama por defecto a `/api/v1` en el mismo dominio. La API publica de lectura incluye:

| Ruta | Uso |
| --- | --- |
| `GET /health` | Estado basico del servicio |
| `GET /api/v1/zones` | Zonas, direcciones y centros para el mapa |
| `GET /api/v1/settings` | Configuracion editorial publica |
| `GET /api/v1/properties` | Catalogo paginado; API admite zona, precio maximo, amenidades, texto y orden |
| `GET /api/v1/properties/:id` | Detalle de una propiedad por codigo |

El esquema del proyecto Supabase del sitio incluye `properties` y `property_images` para el catalogo y sus medios; `admin_users` y `admin_audit_log` para el panel y auditoria; y `site_settings` para configuracion editorial. Las propiedades incluyen codigo, titulo, direccion, zona, precio, gastos, superficie, ubicacion, amenidades, etiquetas, descripcion, destacada/activa, estado y fecha de disponibilidad. El bucket `property-images` conserva los archivos multimedia. Las migraciones posteriores agregan campos y endurecen RLS/permisos; deben aplicarse en el orden indicado en `monoespacios-20m2/docs/SUPABASE.md`.

### 4.4 Administracion de contenido e integracion con el ERP

El sitio incluye un panel propio en `/admin` (entrada `frontend/admin.html`) para administrar unidades, precios, amenidades, publicacion, imagenes/videos, orden y textos alternativos, auditoria y ajustes editoriales. Las escrituras del panel usan `/api/admin/v1`; la API publica `/api/v1` es de solo lectura.

El ERP tambien ofrece `/contenido-web` para que el personal autorizado gestione ese contenido desde su dashboard. El proxy `/api/contenido-web/[...path]` autentica la sesion ERP, exige `web_content.read` para consultas o `web_content.update` para cambios y reenvia la peticion al backend del sitio. La credencial de administracion del sitio se mantiene server-side y no se entrega al navegador.

### 4.5 Sincronizacion de disponibilidad

La sincronizacion operativa es **del ERP al sitio comercial**, no una sincronizacion bidireccional de toda la ficha:

1. `GET /api/publico/estado-departamentos` del ERP publica unidades activas con codigo, estado, `disponibleDesde` y edificio. No incluye inquilinos, telefonos ni identificadores internos.
2. `ERP_ESTADO_DEPARTAMENTOS_URL` configura en el backend del sitio la URL de ese endpoint. El sitio actualiza en su propia tabla solo `availability` y `available_until` de la propiedad cuyo `property_code` coincide.
3. La tarea de Vercel llama diariamente a las 10:00 UTC a `/api/v1/cron/sync-availability` con autenticacion por secreto. Ademas, las consultas del catalogo vuelven a sincronizar cuando vence el cache en memoria de cinco minutos.
4. Los codigos que no coinciden se reportan como desconocidos. Si el ERP falla, el catalogo conserva el ultimo estado conocido; no se actualizan las fichas editoriales del sitio.

El estado reportado por el ERP prioriza un contrato vigente como `ocupado`; de lo contrario puede reflejar mantenimiento, bloqueo o disponibilidad manual. Por ello, la vigencia del catalogo depende de que codigos y contratos esten correctamente mantenidos en ambos sistemas.

### 4.6 Despliegue y verificacion del sitio comercial

La configuracion Vercel en `monoespacios-20m2/vercel.json` compila la SPA a `frontend/dist` y sirve la API Express como funcion Node. El proyecto requiere PostgreSQL/Supabase y variables server-side como `DATABASE_URL`; el panel requiere tambien la configuracion Supabase Auth/Storage. La URL del ERP y los secretos del cron se configuran en el backend, nunca como variables `VITE_*`. La guia detallada de variables, migraciones, despliegue, smoke test y rollback esta en `monoespacios-20m2/docs/DEPLOYMENT.md` y `monoespacios-20m2/docs/SUPABASE.md`.

Comandos de validacion declarados por el sitio:

```powershell
cd monoespacios-20m2
npm run verify
npm run smoke
```

`verify` ejecuta chequeos de tipos, lint, pruebas y build; `smoke` comprueba la API desplegada, filtros y proteccion del panel. Son scripts del proyecto independiente y no los mismos comandos de CI del monorepo ERP.

### 4.7 Endpoints publicos del ERP y panel del ERP

El ERP ofrece endpoints de lectura sin sesion para que el sitio externo consulte disponibilidad:

- `GET /api/publico/disponibilidad`: lista solo unidades publicables/libres e incluye codigo, nombre, numero, piso, precio y edificio.
- `GET /api/publico/estado-departamentos`: estado de unidades activas para presentacion publica: disponible, ocupado, mantenimiento o bloqueado; en ocupadas puede incluir la fecha desde la que se espera disponibilidad.
- Ambos endpoints tienen CORS abierto para consumo por webs externas, son solo GET/OPTIONS y no deben exponer ocupantes, telefonos, identificadores internos u otros datos personales.

La disponibilidad publicada se calcula a partir de contratos con estados ocupantes, fechas de vigencia y los estados manuales del departamento. En consecuencia, que una unidad aparezca disponible depende de que los datos del contrato y del departamento esten actualizados.

En `/contenido-web` hay tres secciones:

1. **Propiedades**
   - Listar, buscar y filtrar propiedades por zona, estado y texto.
   - Crear, editar y eliminar fichas.
   - Gestionar codigo, titulo, direccion, zona, precio, gastos, superficie, ubicacion de mapa y descripcion.
   - Mantener amenidades y etiquetas personalizadas; por ejemplo, amoblado, mascotas, ventanas y tipo de unidad.
   - Marcar si una ficha esta destacada o activa.
2. **Medios**
   - Subir imagenes o videos, asociar medios por URL, ordenarlos y eliminarlos.
   - Mantener texto alternativo.
   - El primer medio actua como portada en el catalogo; el panel acepta JPG, PNG, WebP, AVIF, GIF, MP4 y WebM, con limite documentado de 6 MB por archivo.
   - Las cargas directas usan una URL de subida firmada.
3. **Sitio / Config**
   - Editar portada (hero), textos de "Sobre nosotros", contacto, SEO y parametros avanzados.
   - Configurar limites/pasos de precio y etiquetas definidas por el negocio.

## 5. Aplicacion Android AlquilaYa Repair / FieldOps

### 5.1 Proposito y tecnologia

La app Android esta dirigida al **personal de mantenimiento** para operar ordenes en campo. No es la aplicacion del portal cliente ni una app general de arrendatarios.

- Codigo fuente: `apps/fieldops-mobile`.
- UI: React y JavaScript, compilada por Vite.
- Capa nativa: Capacitor 8 y Android Gradle.
- Identificador Android: `com.alquilaya.fieldops`.
- Nombre visible: **AlquilaYa Repair**.
- Version que indican los ajustes Android consultados: `1.0.4` (versionCode `5`).
- El `webDir` de Capacitor es `dist`; la UI se empaqueta dentro de la aplicacion.
- La API es remota: requiere `VITE_ERP_API_URL` con origen HTTPS del ERP para builds nativos. No se debe incorporar una URL de desarrollo local en un release.

### 5.2 Navegacion

La barra inferior incluye:

| Pestaña | Funcion |
| --- | --- |
| Inicio | Resumen personal, prioridad del dia y proxima visita |
| Mis tareas | Ordenes asignadas, filtros y acceso al detalle |
| Mis visitas | Agenda de visitas programadas |
| Calendario | Vista mensual y visitas por fecha |
| Avisos | Notificaciones de la aplicacion |
| Perfil | Datos del usuario y acciones de sesion |

La interfaz tambien tiene vistas de detalle, evidencia, chat y cierre como parte del flujo de una orden.

### 5.3 Flujo de trabajo en campo

La app sincroniza ordenes asignadas al usuario autenticado y carga informacion de detalle, materiales, visitas, adjuntos e historial. En el detalle de una orden, el personal puede:

- Revisar codigo, ubicacion, residente, prioridad, fechas y descripcion.
- Aceptar una tarea asignada.
- Consultar y confirmar una opcion de disponibilidad para una visita.
- Registrar llegada al sitio y datos de visita.
- Escribir diagnostico y causa; registrar estimaciones, tiempo y costos.
- Agregar materiales con cantidad, unidad y costo.
- Adjuntar evidencia fotografica o multimedia.
- Guardar resolucion y observaciones.
- Solicitar cierre o completar la orden segun su estado y las reglas de negocio.
- Consultar los eventos de auditoria y el historial de reprogramaciones.

El servidor sigue siendo la autoridad de permisos y transiciones: el cliente Android envia cambios a `PATCH /api/operaciones/ordenes/[id]`, pero la API verifica identidad, permiso, orden y transicion permitida.

### 5.4 Inicio de sesion, MFA y notificaciones

- La app usa el mismo servicio de autenticacion del ERP y puede completar MFA cuando el servidor lo solicita.
- La API identifica el cliente nativo con el encabezado `X-FieldOps-Client: android-native`; las sesiones moviles usan cookies dedicadas `HttpOnly`, `Secure` y `SameSite=None` para peticiones cross-origin desde WebView.
- La app solicita permisos Android de notificaciones, audio y microfono.
- Usa Firebase Cloud Messaging/Capacitor Push Notifications para avisos push cuando la configuracion Firebase del build existe; el token se registra en `/api/fieldops/push-token`.
- Puede usar notificaciones locales y reconocimiento de voz en dispositivos compatibles.
- La camara/seleccion de archivos se usa para aportar evidencia al trabajo.

La disponibilidad efectiva de push depende de la configuracion Firebase del proyecto Android y de la configuracion de servidor correspondiente. El uso de microfono y notificaciones depende tambien del permiso concedido por el usuario en Android.

### 5.5 Construccion de la app

Desde la raiz del repositorio:

```powershell
corepack pnpm install
corepack pnpm --filter fieldops-mobile build
corepack pnpm --filter fieldops-mobile android:sync
```

`android:sync` compila la interfaz web y sincroniza los recursos/plugins con Android. Para abrir el proyecto Android:

```powershell
corepack pnpm --filter fieldops-mobile android:open
```

La compilacion release depende de la configuracion de firma Android del entorno. Las claves, contrasenas de keystore y configuraciones de Google no deben incluirse en esta guia, enviarse al repositorio ni compartirse en logs. Confirmar firma y version del APK antes de distribuirlo.

## 6. Portal de clientes

### 6.1 Alcance funcional

El portal de clientes esta enfocado en **reportes de mantenimiento**. No es un autoservicio de pagos o contratos: su funcionalidad principal es registrar incidencias y dar seguimiento a su atencion.

- Acceso: `/portal-cliente/login`.
- Inicio autenticado: `/portal-cliente`.
- Inicio de sesion con codigo de departamento y contrasena asignada por administracion.
- Solo una cuenta activa, asociada al cliente y al contrato vigente correspondiente, puede entrar al contexto de ese departamento.
- Al no ser valida la sesion o dejar de corresponder al contrato actual, el portal redirige al login.

### 6.2 Crear un reporte

El cliente puede enviar un reporte indicando:

- Tipo de incidencia.
- Descripcion.
- Si estara presente en la visita.
- Tres opciones de disponibilidad para la visita, cada una en una ventana de dos horas.
- Hasta cinco archivos multimedia, cada uno de hasta 8 MB.

Los tipos permitidos por el flujo de carga son JPEG, PNG, WebP, MP4 y WebM. El servidor controla tipo, tamano, identidad del cliente y la relacion del archivo con su solicitud; las cargas usan enlaces firmados a Storage. La solicitud nace como pendiente de revision y el equipo puede convertirla en orden de trabajo.

### 6.3 Seguimiento y comunicacion

El portal permite:

- Consultar solicitudes enviadas y ordenes de trabajo vinculadas al cliente.
- Ver estado, linea de tiempo de eventos y opciones/horarios de visita.
- Consultar archivos adjuntos y abrir una vista previa de fotos/videos.
- Recibir avisos y marcar notificaciones como leidas.
- Actualizar la informacion del reporte desde la accion de refrescar.
- Abrir un chat asociado a la orden cuando el flujo operativo lo habilita.

El chat tiene reglas de disponibilidad: se asocia a la orden del propio cliente y puede estar habilitado cuando el cliente no esta presente durante la visita y el tecnico ya llego; no se permite continuar en ordenes cerradas o canceladas. Los mensajes se cifran antes de guardarse en la base de datos. El portal refresca avisos periodicamente cuando la pagina esta visible.

### 6.4 Seguridad del portal

- Las rutas `/api/portal-cliente/*` resuelven una identidad de portal distinta de la sesion interna del ERP.
- La identidad se enlaza con la cuenta Supabase, el cliente, el codigo de departamento y el contrato vigente; las consultas de ordenes filtran por el `clientId` autenticado.
- Las acciones que cambian estado verifican el origen de la solicitud.
- El login y las cargas tienen limitacion de intentos/peticiones.
- Las sesiones se guardan en cookies `HttpOnly`; en produccion se usa prefijo `__Host-` y `Secure`.
- Los endpoints de sesion, chats y notificaciones establecen `Cache-Control: no-store` donde corresponde.
- Los adjuntos se entregan por una ruta autenticada; el portal no debe confiar en un identificador de archivo recibido del navegador sin validar su propiedad.

## 7. APIs e integracion entre plataformas

| Cliente | Endpoints representativos | Autorizacion |
| --- | --- | --- |
| ERP web | `/api/contracts`, `/api/payments`, `/api/departamentos`, `/api/operaciones/ordenes`, `/api/rrhh`, `/api/dashboard` | Sesion Supabase del personal y permiso RBAC por endpoint |
| Exportacion | `GET /api/exportaciones?month=YYYY-MM` | Requiere `contract.read` y `department.read` |
| Sitio publico | `/api/publico/disponibilidad`, `/api/publico/estado-departamentos` | Lectura publica limitada a campos publicables |
| Panel de contenido | `/api/contenido-web/[...path]` | Sesion ERP y `web_content.read` o `web_content.update`; proxy server-side al admin API externo |
| Sitio comercial | `/api/v1/zones`, `/api/v1/settings`, `/api/v1/properties`, `/api/admin/v1/*` | Catalogo GET publico; escrituras administrativas requieren autenticacion del panel |
| Android | `/api/auth/*`, `/api/operaciones/empleados`, `/api/operaciones/ordenes`, materiales, disponibilidad y evidencias | Sesion nativa del usuario y permisos `work_order.*` |
| Portal | `/api/portal-cliente/auth/*`, `/session`, `/ordenes`, `/notificaciones`, `/uploads`, `/adjuntos`, chat | Sesion propia del portal y pertenencia cliente-orden verificada |

Las rutas del ERP se implementan en `apps/web/src/app/api`; las del sitio comercial, en `monoespacios-20m2/backend/src`. El detalle de parametros y cuerpos debe consultarse en cada ruta y sus validaciones; esta guia no reemplaza el contrato OpenAPI de una API.

## 8. Datos principales

El esquema PostgreSQL esta definido en `packages/db/src/schema`:

| Dominio | Tablas representativas |
| --- | --- |
| Acceso interno | `users`, `permissions`, `role_permissions`, `user_permissions`, `permission_requests` |
| Propiedades y clientes | `departments`, `clients`, `contacts` |
| Contratos y documentos | `contracts`, `contract_snapshots`, `documents`, `templates`, tablas de clausulas y anexos |
| Cobranza | `payments`, `servicios_extras`, tablas de contabilidad y gastos |
| Mantenimiento | `work_orders`, `work_order_assignments`, `work_order_visits`, `work_order_materials`, `work_order_events`, `work_order_attachments` |
| Portal cliente | `client_portal_accounts`, `client_work_order_requests`, `client_portal_uploads`, `client_portal_notifications`, `work_order_availability_options`, `work_order_chats`, `work_order_chat_messages` |
| RR. HH. | `hr_employees`, estructura organizacional, empleos, documentos, onboarding y `attendance` |
| Marketing | `leads`, `conversations`, `messages`, reglas y ejecuciones de automatizacion |
| Integraciones y auditoria | `connector_instances`, credenciales/logs, `activity_events` y `audit_events` |

Los archivos binarios se guardan en Supabase Storage; PostgreSQL conserva metadatos y vinculos. No se deben incluir contrasenas, tokens, cookies, claves de firma o datos reales de clientes en documentacion o ejemplos.

## 9. Entornos y variables

Los valores reales se configuran fuera del codigo mediante secretos de despliegue. Los archivos `.env.example` enumeran nombres de variables, no deben contener valores de produccion.

| Variable / familia | Uso |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Conexion PostgreSQL |
| `NEXT_PUBLIC_SUPABASE_URL`, claves Supabase | Autenticacion y servicios Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones administrativas server-side; nunca exponer en navegador |
| `SUPABASE_STORAGE_BUCKET` | Bucket predeterminado para documentos |
| `MFA_ENFORCE` | Activa el requisito de MFA para roles privilegiados segun politica |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limit distribuido cuando se configura |
| `VITE_ERP_API_URL` | Origen HTTPS remoto usado por el APK nativo |
| `FIELDOPS_ANDROID_ORIGIN` | Origen permitido para la comunicacion cross-origin de Android |
| `ALQUILAYA_API_URL` y credenciales admin | Proxy server-side hacia la API de administracion del sitio |
| `CLIENT_CHAT_ENCRYPTION_KEY` | Cifrado de mensajes del chat de cliente |
| Credenciales Firebase/Google/WhatsApp | Servicios externos cuando se habilitan |

No copiar valores de `.env`, `.env.local`, archivos de firma o consolas cloud a este documento. Mantener el manifiesto de ejemplo actualizado sin secretos.

## 10. Desarrollo, pruebas y despliegue

### ERP web

```powershell
corepack pnpm install
corepack pnpm --filter @contract/web dev
corepack pnpm --filter @contract/web lint
corepack pnpm --filter @contract/web typecheck
corepack pnpm --filter @contract/web test
corepack pnpm --filter @contract/web build
```

### Aplicacion Android

```powershell
corepack pnpm --filter fieldops-mobile dev
corepack pnpm --filter fieldops-mobile lint
corepack pnpm --filter fieldops-mobile build
corepack pnpm --filter fieldops-mobile android:sync
```

El build web se sirve localmente en el puerto 3000 con el script de Next. Para desarrollo de Android, `vite.config.js` puede dirigir `/api` al ERP local por medio de `FIELDOPS_ERP_ORIGIN`; el APK instalado en un dispositivo debe usar el origen alcanzable del ERP y HTTPS.

### Sitio comercial independiente

```powershell
cd monoespacios-20m2
npm run dev
npm run verify
```

Para desarrollo por separado, `npm run dev:frontend` y `npm run dev:backend` levantan los workspaces respectivos. Consultar el README del sitio y sus documentos de despliegue para configurar Supabase y variables.

En el ERP, las migraciones se mantienen en `supabase/migrations` junto con los esquemas Drizzle. Para el sitio comercial, las migraciones separadas estan en `monoespacios-20m2/supabase/migrations`. Consultar [`DEPLOY.md`](./DEPLOY.md) y [`BACKUP-DR.md`](./BACKUP-DR.md) antes de aplicar cambios de esquema o hacer restauraciones.

### Produccion

- El ERP web se despliega desde la rama principal mediante el flujo configurado en Vercel/GitHub.
- Los jobs de CI pueden incluir pruebas, lint, typecheck, builds web y builds desktop; cada job puede terminar en tiempos distintos.
- Que el sitio responda HTTP 200 no demuestra por si solo que una nueva version esta desplegada; verificar el estado del deployment asociado al commit.
- El APK es un artefacto independiente del despliegue web. Publicar una version Android requiere build release, firma y distribucion separadas.
- Tras publicar, probar acceso autenticado y flujos representativos con cuentas autorizadas; no ejecutar validaciones destructivas en datos productivos.

## 11. Limites y distinciones importantes

1. **Sitio publico:** el frontend comercial vive en `monoespacios-20m2`, con API y base de datos propias; el ERP administra contenido mediante un proxy y publica la disponibilidad que consume el sitio. No confundir la raiz del ERP con el catalogo.
2. **Portal:** el portal implementado cubre mantenimiento e incidencias; no asumir que tiene pagos en linea, descargas de contrato o firma electronica.
3. **Android:** FieldOps esta pensado para ordenes de mantenimiento, no para operaciones contractuales o pagos del inquilino.
4. **Datos publicos:** los endpoints publicos de disponibilidad no reemplazan la autorizacion de las APIs internas ni deben utilizarse para recuperar datos personales.
5. **Estados de operacion:** las reglas de transicion y elegibilidad las valida el servidor; el texto/etiqueta que muestra la UI es una representacion legible.
6. **Funciones externas:** mensajes, push, Google y contenido web dependen de secretos y configuraciones externas; la presencia de una pantalla no prueba que una integracion este activa en cada entorno.
7. **Seguridad:** esta guia describe controles visibles en codigo, no certifica el estado actual de infraestructura, cuentas cloud, contrasenas, claves de firma, CVEs ni configuracion de produccion.

## 12. Referencias de codigo

- Shell, navegacion y permisos de pantalla: `apps/web/src/components/dashboard-shell.tsx`.
- Barra superior y notificaciones: `apps/web/src/components/top-bar.tsx`.
- Sesion y RBAC server-side: `apps/web/src/lib/session.ts`, `apps/web/src/lib/supabase-auth.ts`, `packages/domain/src/rbac`.
- Esquemas de datos: `packages/db/src/schema`.
- Panel de contenido y cliente API: `apps/web/src/components/contenido-web`, `apps/web/src/lib/contenido-web-client.ts`.
- Disponibilidad publica: `apps/web/src/app/api/publico`.
- Portal cliente: `apps/web/src/app/portal-cliente`, `apps/web/src/app/api/portal-cliente`, `apps/web/src/lib/client-portal-auth.ts`.
- Operaciones API: `apps/web/src/app/api/operaciones`.
- FieldOps Android: `apps/fieldops-mobile/src/App.jsx`, `apps/fieldops-mobile/src/fieldops-api.js`, `apps/fieldops-mobile/capacitor.config.ts` y `apps/fieldops-mobile/android`.
- Sitio comercial: `monoespacios-20m2/README.md`, `monoespacios-20m2/frontend/src`, `monoespacios-20m2/backend/src`, `monoespacios-20m2/supabase/migrations` y `monoespacios-20m2/docs`.
- Deployment y continuidad: [`DEPLOY.md`](./DEPLOY.md), [`BACKUP-DR.md`](./BACKUP-DR.md).
