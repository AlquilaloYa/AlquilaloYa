# AlquilaYa FieldOps para Android

App Android instalable con su interfaz empaquetada dentro del APK/AAB mediante
Capacitor. La app usa el ERP como backend; Supabase se mantiene detrás de las
API autenticadas del ERP.

## Desarrollo web local

Desde la raíz del monorepo:

```sh
corepack pnpm install
corepack pnpm --filter @contract/web dev
corepack pnpm --filter fieldops-mobile dev
```

Vite reenvía `/api` a `http://localhost:3000`. El servidor ERP necesita su
configuración local de Supabase y base de datos.

## Preparar e instalar en Android

Requiere Android Studio con Android SDK, JDK 21 y una URL HTTPS accesible para
el ERP. Crea `apps/fieldops-mobile/.env.local` a partir de `.env.example` y
configura únicamente el origen público del servidor (sin secretos):

```dotenv
VITE_ERP_API_URL=https://erp.example.com
```

En el entorno del ERP configura `FIELDOPS_ANDROID_ORIGIN=https://localhost`.
Ese es el origen local seguro usado por Capacitor Android; el middleware solo
autoriza ese origen para llamadas CORS con credenciales. Las sesiones nativas
usan cookies HttpOnly separadas, `Secure` y `SameSite=None`; la app no guarda
tokens de Supabase. Supabase sigue conectado exclusivamente desde el backend.

Genera los recursos web empaquetados y sincronízalos con Android:

```sh
corepack pnpm --filter fieldops-mobile android:sync
```

Abre el proyecto con `android:open`, selecciona un emulador o teléfono
conectado y ejecuta la configuración `app`. Android Studio puede generar un
APK de prueba; para distribución genera un AAB/APK Release firmado con la
clave de publicación de la organización. No se configura ni se publica una
clave de firma en este repositorio.

La app instalada requiere conexión al ERP. No apunta al servidor de desarrollo
ni a `localhost` para obtener datos: la dirección HTTPS se incorpora al
compilar y la API debe permitir CORS desde `https://localhost`.

## Comprobaciones

```sh
corepack pnpm --filter fieldops-mobile lint
corepack pnpm --filter fieldops-mobile build
corepack pnpm --filter @contract/web typecheck
```

`android:run` compila e instala la app en un dispositivo conectado.

## Funcionalidad

- Inicio
- Mis tareas, con filtros por urgentes, prioridad alta, pendientes y finalizadas
- Mis visitas y calendario mensual
- Notificaciones de órdenes recientes
- Perfil y cierre de sesión

El detalle de una orden recorre recepción y aceptación, programación de
visitas, confirmación de llegada, diagnóstico, materiales, costos y tiempo,
resolución, evidencias y cierre. Las órdenes, citas, materiales y evidencias se
guardan mediante las API autenticadas del ERP.

Al abrir una orden, el trabajador puede consultar las fotos o videos que adjuntó
el cliente. Si el reporte incluye opciones de horario, puede confirmar una de
ellas desde la app y programar la visita con la disponibilidad elegida por el
cliente. La visita inicial conserva el horario confirmado; el trabajador solo
puede modificarlo mediante la acción explícita de reprogramación, que exige
motivo y guarda el horario anterior en el historial. Una visita de seguimiento y
las citas con el cliente se registran por separado.

### Notificaciones push de órdenes urgentes

La app registra su token FCM al iniciar sesión y el ERP envía una notificación
Android al crear o asignar una orden urgente. Para habilitarlo:

1. Crea un proyecto en Firebase y registra una app Android con el identificador
   `com.alquilaya.fieldops`.
2. Descarga `google-services.json` y colócalo en
   `apps/fieldops-mobile/android/app/google-services.json`. No lo publiques ni
   lo compartas por chat.
3. En Firebase, crea una cuenta de servicio para el backend. Guarda el JSON
   completo como variable de entorno de producción `FIREBASE_SERVICE_ACCOUNT_JSON`
   en Vercel; no lo agregues al repositorio.
4. Aplica
   `supabase/migrations/20261014120000_fieldops_push_tokens.sql`, despliega el
   backend y vuelve a compilar/reinstalar la app con `android:sync`.

Sin el archivo Android y la variable de entorno, la app y el ERP pueden compilar,
pero Firebase no entregará notificaciones push. La actualización periódica y el
aviso dentro de la app siguen funcionando mientras FieldOps está abierta.

## Datos y seguridad

El acceso usa las credenciales y el MFA del ERP, con cookies HttpOnly
compatibles con el origen nativo. La app no almacena tokens ni usa datos de
demostración como respaldo cuando la API falla. Las evidencias admiten fotos
JPG, PNG o WebP.

Antes de habilitar los campos nuevos del flujo móvil, revisa y aplica la
migración al entorno de base de datos elegido:
`supabase/migrations/20261012120000_fieldops_mobile_workflow.sql` (equivalente
a `packages/db/drizzle/0019_fieldops_mobile_workflow.sql`). No se aplica
automáticamente al iniciar ni compilar la app.
