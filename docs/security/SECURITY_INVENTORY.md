# Inventario de datos, secretos y separación de entornos — AlquilaYa ERP

**Controles:** SEC-001 (separar staging/prod), SEC-002 (inventario de datos y secretos)
**Fecha:** 2026-10-10
**Alcance:** aplicación web/worker, base de datos Postgres (Supabase), Storage y
servicios externos.

> Este documento **no contiene valores** de secretos, solo sus nombres, propósito
> y controles. Mantener actualizado ante cada variable o fuente de datos nueva.

---

## 1. Clasificación

| Nivel | Descripción | Ejemplos |
| --- | --- | --- |
| **Público** | Puede exponerse sin riesgo. | URL pública, anon key. |
| **Interno** | Uso operativo; daño bajo si se filtra. | contadores, catálogos. |
| **Confidencial** | Datos de negocio sensibles. | contratos, mensajería. |
| **Sensible / PII** | Datos personales o financieros; protección reforzada. | empleados, clientes, pagos. |
| **Secreto** | Credenciales/claves; nunca en repositorios ni logs. | service_role, claves de cifrado. |

---

## 2. Inventario de datos (por categoría)

| Categoría | Tablas / almacenamiento | Clasificación | Notas |
| --- | --- | --- | --- |
| Identidad y acceso | `users`, `user_permissions`, `role_permissions`, `permissions`, `permission_requests` | Sensible | Credenciales en **Supabase Auth** (hash gestionado por Supabase); la tabla `users` no guarda contraseñas. |
| Auditoría / actividad | `audit_events`, `activity_events` | Confidencial | Append-only deseable (ver SEC-052). Retención por definir (SEC-053). |
| Clientes y contactos | `clients`, `contacts`, `leads` | Sensible / PII | Nombres, contacto, DNI en algunos casos. |
| Contratos y documentos | `contracts`, `contract_snapshots`, `templates`, `template_versions`, `clauses`, `clause_versions`, `annexes`, `annex_versions`, `separations`, `documents` | Confidencial | PDFs en bucket privado `contracts`; snapshots inmutables con `sha256`. |
| Cobranza y pagos | `payments`, `department_inventories` | Sensible | Vouchers de pago (imágenes) en `payments.vouchers`/`voucherUrl`. |
| RRHH | `hr_employees`, `hr_employments`, `hr_employee_documents`, `hr_employee_history`, `hr_requests`, `hr_organizations`, `hr_departments`, `hr_sites`, `hr_teams`, `hr_positions`, `hr_onboarding_processes`, `hr_onboarding_tasks`, `attendance` | Sensible / PII | Documentos en bucket privado `hr-documents`. |
| Operaciones / inspecciones | `inspections`, `inspection_templates`, `inspection_questions`, `work_orders`, `work_order_*`, `tasks`, `departments`, `inventario_catalogo` | Interno | Evidencias en bucket privado `work-order-evidence`. |
| Mensajería / automatización | `conversations`, `messages`, `message_templates`, `bot_rules`, `automation_rules`, `automation_runs` | Confidencial | Contenido de conversaciones de canales externos. |
| Integraciones | `connector_instances`, `connector_credentials`, `connector_logs`, `user_google_tokens` | Secreto | Tokens/credenciales **cifrados** (AES-256-GCM, SEC-041/SEC-076). |

### Buckets de Storage

| Bucket | Público | Límite / tipos | Clasificación |
| --- | --- | --- | --- |
| `contracts` | No | PDFs de contrato | Confidencial |
| `hr-documents` | No | 25 MB · PDF/JPEG/PNG | Sensible / PII |
| `work-order-evidence` | No | 8 MB · JPEG/PNG/WebP | Interno |

Acceso por **URL firmada** con TTL (SEC-031/SEC-083) usando `service_role`.

---

## 3. Inventario de secretos (variables de entorno)

| Variable | Propósito | Clasificación | Rotación / control |
| --- | --- | --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Conexión Postgres (driver / migraciones) | Secreto | Rotar contraseña de BD; actualizar en el gestor de secretos. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Admin de Supabase (Auth/Storage, **bypass RLS**) | **Secreto crítico** | Rotar en Supabase; nunca exponer al cliente. |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_*` | Cliente/validación de sesión | Público | No es secreto; limitar por RLS. |
| `CONNECTOR_ENCRYPTION_KEY` | Cifrado de credenciales/tokens | **Secreto crítico** | Obligatoria, falla-cerrado. Rotar con `pnpm --filter @contract/db credentials:rotate` (SEC-041). |
| `CONNECTOR_ENCRYPTION_KEY_PREVIOUS` | Clave previa durante rotación | Secreto | Solo durante la ventana de rotación; retirar al terminar. |
| `REDIS_URL` / `UPSTASH_REDIS_REST_TOKEN` | Colas BullMQ / rate limit | Secreto | Requiere TLS y auth (SEC-062). |
| `MESSAGING_WEBHOOK_TOKEN` | Autentica el gateway de mensajes | Secreto | Comparación en tiempo constante (SEC-042). |
| `META_APP_SECRET` / `META_VERIFY_TOKEN` | Firma HMAC y verificación de webhook Meta | Secreto | Rotar en Meta. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Envío por WhatsApp Cloud API | Secreto | Rotar token de Meta. |
| `CRON_SECRET` | Protege `/api/cron/*` (Bearer) | Secreto | Generar fuerte; comparar en tiempo constante (SEC-042). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google Calendar | Secreto | Rotar en Google Cloud; scopes mínimos (SEC-043). |
| `ALQUILAYA_ADMIN_EMAIL` / `ALQUILAYA_ADMIN_PASSWORD` | Integración con el sitio AlquilaYa | Secreto | Rotar credencial; mínimo privilegio. |
| `SUPABASE_USERS_PASSWORD` | Contraseña inicial de aprovisionamiento | Secreto | Solo en el script de seed; no usar en runtime. |

**Reglas**
- `.env` **no** se versiona (solo `.env.example`, sin valores).
- `assertProductionSecrets()` (`packages/config/src/env.ts` → `production-secrets.ts`)
  **se ejecuta al cargar la configuración en producción** y aborta si faltan
  `SUPABASE_URL`, `SUPABASE_ANON_KEY` o `CONNECTOR_ENCRYPTION_KEY`, si alguno
  tiene valor de plantilla/dummy (p. ej. los dummies de CI), si apuntan a
  `localhost` o si `CONNECTOR_ENCRYPTION_KEY_PREVIOUS` sigue configurada tras
  rotar. Se omite durante `next build`. Pruebas:
  `packages/config/src/production-secrets.test.ts`.
- Los secretos se custodian en el gestor de secretos del proveedor (Vercel y/o
  el panel de Postgres/Supabase), no en archivos del repo.
- Los eventos de auditoría/actividad **no** deben contener secretos (revisar
  `metadataSegura`/`metadata`).

---

## 4. Separación de entornos (SEC-001)

### Estado deseado

Staging y producción deben ser **instancias independientes** con datos y
credenciales **distintos**. Nunca compartir base de datos, buckets ni claves.

| Recurso | Producción | Staging |
| --- | --- | --- |
| Proyecto Supabase | `<prod>` | `<staging>` (separado) |
| `DATABASE_URL` / `DIRECT_URL` | BD prod | BD staging |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | staging |
| `CONNECTOR_ENCRYPTION_KEY` | **distinta** | **distinta** |
| Buckets Storage | prod | staging |
| Google OAuth client / Redirect URI | dominio prod | dominio staging |
| `CRON_SECRET`, `MESSAGING_WEBHOOK_TOKEN`, `META_*`, `WHATSAPP_*` | prod | staging |

### Checklist

- [ ] Crear proyecto Supabase de staging independiente.
- [ ] Variables de entorno separadas por entorno en el proveedor (Vercel:
      Production / Preview / Development).
- [ ] Clave de cifrado propia por entorno (no reutilizar).
- [ ] Webhooks de Meta/WhatsApp apuntando a la URL del entorno correcto.
- [x] `assertProductionSecrets()` activo en producción.
- [ ] Prohibir `drizzle-kit push` contra producción (ver SEC-023); aplicar
      migraciones versionadas.
- [ ] Datos de producción no se copian a staging sin anonimizar.

> La separación efectiva depende de la infraestructura (secrets del proveedor),
> por lo que SEC-001 permanece **parcial en su parte operativa**: las guardas en
> código (`assertProductionSecrets`, con pruebas) están completas; queda crear el
> proyecto de staging y separar variables en el panel de despliegue (checklist §4).

---

## 5. MFA y política de contraseñas (SEC-015)

- **Contraseñas**: longitud mínima **12** caracteres, aplicada en
  `apps/web/src/lib/password-policy.ts` (altas y cambios desde la
  administración) y en los scripts de aprovisionamiento.
- **Revocación de sesiones**: al desactivar un usuario se le **banea** en
  Supabase Auth (bloquea login y refresco de tokens); reactivar lo desbanea
  (SEC-077). El acceso se niega además con `active=false` en `session.ts`.
- **MFA (TOTP)**: la app implementa el ciclo completo (enrolar, retar y
  verificar) contra Supabase Auth por REST (`apps/web/src/lib/mfa.ts`), sin
  SDK, más la **exigencia** de MFA (AAL2) a `ADMIN` y `DEVELOPER` con la
  variable `MFA_ENFORCE=true`.
  - **Enrolamiento**: `/configuraciones/seguridad` (visible para cualquier
    sesión; nav "Seguridad") → `POST /api/auth/mfa/enroll` (QR + secreto) →
    `POST /api/auth/mfa/activate` (código). Retirada con `DELETE /api/auth/mfa`.
  - **Login**: si el usuario tiene un factor verificado, el login devuelve
    `{ mfaRequired: true }` guardando la sesión AAL1 solo en cookies temporales
    (`sb_mfa_at`/`sb_mfa_rt`, 10 min) y el segundo paso se completa en
    `POST /api/auth/mfa/verify`; solo entonces se emiten las cookies de sesión
    (AAL2).
  - **Enforcement**: con `MFA_ENFORCE=true`, `requireUser` decodifica el claim
    `aal` del access token (`apps/web/src/lib/jwt.ts`) y rechaza sesiones AAL1
    de roles privilegiados con `403 { code: "MFA_REQUIRED" }`.
  - **Antes de activar** `MFA_ENFORCE=true`, verificar que TOTP esté habilitado
    en Supabase (Authentication → Multi-Factor; activo por defecto) y que esos
    usuarios hayan enrolado un factor; si no, quedarían bloqueados.
  - Para proteger el **panel de Supabase**, activar MFA en la cuenta
    (Settings → Account → Security) y, si el plan lo permite, exigirlo en la
    organización.

---

**Fin — Inventario de datos/secretos y entornos (SEC-001/SEC-002).**
