# Plan de mejoras de seguridad — Verificación y V1.1

**Proyecto:** AlquilaYa ERP
**Base:** `PLAN_DE_MEJORAS_DE_SEGURIDAD_ALQUILAYA_ERP_V1.0.md` + `docs/ERP.md`
**Estado:** Revisión verificada contra el código (no solo documentación)
**Fecha:** 2026-10-10

> Este documento **no reemplaza** el V1.0. Lo corrige, verifica control por control
> contra el repositorio y añade hallazgos. Cada afirmación "verificada" incluye la
> ruta de código que la sustenta. Lo marcado como *requiere verificación* aún no
> se pudo confirmar y no debe darse por cierto.

---

## A. Correcciones a las premisas del V1.0

Las siguientes afirmaciones del V1.0 (heredadas de `ERP.md`) **no coinciden** con el
código. Deben corregirse antes de tomar decisiones.

| Premisa V1.0 / ERP.md | Hallazgo verificado | Evidencia |
| --- | --- | --- |
| Existe CI/CD con `deploy.yml` que publica en GHCR y notifica un webhook. | **No existe `deploy.yml`.** Solo hay `ci.yml` y `backup.yml`. `docs/DEPLOY.md` y el README lo referencian, pero el workflow no está en el repo. | `.github/workflows/` (solo `backup.yml`, `ci.yml`) |
| `audit_events` y `activity_events` cubren auditoría y actividad. | `audit_events` **solo se escribe para flujos de contrato**. Las acciones administrativas (usuarios, roles, permisos) escriben **solo `activity_events`**. | `apps/web/src/lib/contract-app.ts:24-31`; `apps/web/src/app/api/users/[id]/route.ts:151,198` |
| La app usa RLS de Supabase para aislar datos. | **No existe ninguna `CREATE POLICY`** en migraciones. La única migración RLS (`0039`) solo revoca `EXECUTE` de `rls_auto_enable()`. La app accede por conexión directa (`postgres`) + `service_role`, que **no aplican RLS**. | `supabase/migrations/0039_rls_auto_enable_solo_admin.sql`; `packages/db/src/worker.ts` |
| AES-256-GCM para credenciales (seguro). | El algoritmo es correcto (IV 12B aleatorio + auth tag), **pero la clave tiene un fallback silencioso a `"default"`** si falta la variable, y se deriva con un `sha256` simple sin KDF ni versionado. | `packages/db/src/crypto/credential-cipher.ts:11-14` |
| Buckets privados para documentos. | Se usa `service_role` y se valida origen/ruta de la URL firmada, pero el TTL por defecto es **3600 s** y la clave de objeto no sanea segmentos `..`. Requiere verificación por bucket. | `apps/web/src/lib/storage.ts:12,140-185` |
| Autorización en runtime por `AccessControl.forRole`. | Correcto y centralizado: las rutas de negocio usan `requireUser` + `requirePermission`. | `apps/web/src/lib/session.ts:43,69` |

---

## B. Estado verificado control por control

Leyenda: **✅ Cumplido** · **🟡 Parcial** · **🔴 Pendiente** · **❔ Requiere verificación**

| Control | Estado | Evidencia / nota | Mejora concreta |
| --- | --- | --- | --- |
| SEC-001 Separar staging/prod | ✅ | Código: `assertProductionSecrets()` ahora **está cableado** (se ejecuta al cargar la configuración en producción) y es más estricto: exige `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `CONNECTOR_ENCRYPTION_KEY`, rechaza valores de plantilla/dummy (p. ej. los de CI), recursos `localhost` y que `CONNECTOR_ENCRYPTION_KEY_PREVIOUS` siga configurada; se omite durante `next build`. Pruebas: `packages/config/src/production-secrets.test.ts` (10). | Separación física por entorno (infra): `docs/security/SECURITY_INVENTORY.md` §4. Verificar en el panel de despliegue. |
| SEC-002 Inventario datos/secretos | ✅ | Inventario de datos por categoría, buckets y secretos (sin valores). | `docs/security/SECURITY_INVENTORY.md`. |
| SEC-010 Unificar autorización | ✅ | `requireUser`/`requirePermission` centralizados (`session.ts`). Test estructural `route-auth.test.ts` verifica que toda ruta `/api/**` llama `requireUser(` salvo una allowlist justificada (login/logout/mfa, cron, webhooks, health, publico) y que la allowlist no tiene entradas obsoletas. | Mantener la allowlist; ampliar si se añaden endpoints públicos. |
| SEC-011 Permisos por acción | ✅ | `permissions.ts` separa read/create/update/emit/sign/cancel; RRHH solo lectura (`role-permissions.ts`). | Mantener; añadir pruebas negativas por acción. |
| SEC-012 Precedencia permisos individuales | 🟡 | Hoy es **unión** rol ∪ individuales; **no hay "deny"** ni revocación. Hay tests. | Documentar política (unión) y decidir si se admite denegación explícita. |
| SEC-013 Limitar ADMIN/DEVELOPER | 🔴 | **Paridad total** actual: ADMIN y DEVELOPER idénticos salvo `permission_request.create`. | Justificar por escrito o separar privilegios. |
| SEC-014 Autorización por recurso | 🟡 | Hay filtros por rol (p. ej. órdenes asignadas al expediente). Falta auditoría recurso por recurso. | Auditar contratos, RRHH, pagos, conversaciones, órdenes. |
| SEC-015 Ciclo de vida cuentas/sesiones | 🟡 | `active===false` → 403; al desactivar se **banea en Supabase Auth** (login y refresco de tokens) y al reactivar se desbanea. Contraseña mínima 12. **MFA (TOTP) completo**: enrolamiento (`/configuraciones/seguridad` + `/api/auth/mfa/enroll|activate|mfa`), paso challenge en el login (`mfaRequired` → `/api/auth/mfa/verify`) y exigencia a ADMIN/DEVELOPER con `MFA_ENFORCE=true` validando el claim `aal` (`session.ts` + `jwt.ts`, tests). | Activar `MFA_ENFORCE=true` en prod **tras** enrolar a los privilegiados. Ver `SECURITY_INVENTORY.md` §5. |
| SEC-020 Auditar RLS | ✅ | RLS habilitada en **57/57** tablas de `public`, **0 políticas** → deny por defecto para anon/authenticated. | Informe: `docs/security/RLS_INVENTORY.md`; verificación `pnpm --filter @contract/db rls:check`. |
| SEC-021 Probar RLS | ✅ | `rls:check` (RLS en 57/57, 0 políticas) **+ `rls:check:rest`** (`packages/db/scripts/check-rls-rest.ts`): consulta PostgREST con la clave anon y confirma que ninguna tabla expone filas. Ejecutado: 57 tablas, 0 exposiciones. | Re-ejecutar `rls:check`/`rls:check:rest` tras cada migración y al exponer REST. |
| SEC-022 Funciones privilegiadas | 🟡 | `0039` revoca `rls_auto_enable()` a anon/authenticated/service_role. Falta inventario de `SECURITY DEFINER`. | Inventariar y restringir. |
| SEC-023 Controlar migraciones | 🟡 | Migraciones versionadas en `supabase/migrations/`. `db:push` disponible. Sin rollback documentado. | Prohibir `push` en prod; documentar reversión. |
| SEC-030 Revisar buckets | ❔ | `contracts`, `work-order-evidence`, documentos RRHH. | Verificar privacidad y políticas por bucket. |
| SEC-031 Autorizar descarga | 🟡 | URL firmada con validación de origen/ruta (`storage.ts:174-182`). TTL 3600 s. | Reducir TTL; sanear segmentos `..`; no persistir URL firmada. |
| SEC-032 Validar cargas | ❔ | Límites definidos en migraciones de bucket; validación de tipo en código por confirmar. | Validar tamaño/tipo real, no solo extensión. |
| SEC-033 Integridad documental | 🟡 | Snapshot inmutable, `sha256` en `documents`, endpoint `verify`. | Restringir sustitución de emitidos; auditar. |
| SEC-040 Proteger claves | 🟡 | `.env` **no versionado** (solo `.env.example`); sin `NEXT_PUBLIC_` con secretos. | Gestor de secretos + rotación. |
| SEC-041 Cifrado credenciales | ✅ | AES-256-GCM; **falla-cerrado** sin clave, formato versionado `v1:<keyId>:<iv>:<tag>:<ct>`, soporte de clave previa y script de rotación. | Implementado: `packages/db/src/crypto/credential-cipher.ts`, `credential-cipher.test.ts` (9 pruebas), `scripts/rotate-credentials.ts`. |
| SEC-042 Validar webhooks | 🟡 | Meta: HMAC-SHA256 + `timingSafeEqual` (`webhooks/meta/route.ts:35-41`). Mensajes: token `!==` (no constante). Idempotencia en mensajería. | Comparación constante; replay protection explícita. |
| SEC-043 OAuth Google | 🟡 | `state` contra cookie httpOnly (`agenda/google/callback/route.ts:29-31`). | Confirmar scopes mínimos y revocación. |
| SEC-050 Eventos de auditoría | ✅ | Contratos ya auditaban; ahora también usuarios, roles, permisos individuales, aprobaciones de solicitudes, integraciones, pagos, RRHH y **módulos de negocio** (mensajería, inspecciones, plantillas de inspección, inventarios) vía `DrizzleAuditRepository.recordAdminEvent` y `registrarActividadHR`. | Cobertura completa por módulo; queda definir retención (SEC-053). |
| SEC-051 Separar actividad/auditoría | 🟡 | Ambas tablas existen; usos no documentados; auditoría incompleta. | Definir propósito/retención/acceso. |
| SEC-052 Anti-manipulación logs | ✅ | Trigger `prevent_log_mutation` bloquea UPDATE/DELETE en `audit_events` y `activity_events` (también para el propietario); validado con prueba transaccional (rollback). | Migración `20261010120000_append_only_audit_logs.sql`. Export a destino separado: opcional futuro. |
| SEC-053 Retención/eliminación | 🔴 | No existe política. | Definir por categoría. |
| SEC-060 Validación de entradas | 🟡 | Zod en varias fronteras. `/api/health` devuelve `error.message` de la BD. | No filtrar errores internos; Zod en todas las rutas. |
| SEC-061 Rate limiting | 🟡 | Middleware por IP (`middleware.ts:36-51`), Upstash opcional, fallback local. | Límites por endpoint (login/webhooks/PDF); confianza de proxy. |
| SEC-062 Worker/BullMQ | ❔ | Colas `pdf-generation`/`notifications`. Verificar Redis (TLS/auth) y payloads. | Restringir Redis; validar jobs; idempotencia. |
| SEC-063 PDF | ❔ | Playwright/Chromium. | Aislar, limitar recursos, evitar SSRF local en plantillas. |
| SEC-070 CI/CD | 🟡 | `ci.yml`: lint/typecheck/test/build/desktop + `permissions: contents: read` (mínimo) + job `security` con **gitleaks** (secretos, `.gitleaks.toml`) y **dependency-review**. Sin escaneo de imágenes; `deploy.yml` sigue ausente. | Añadir escaneo de imágenes y (si aplica) `deploy.yml`. |
| SEC-071 Config segura | ✅ | Headers presentes; **HSTS añadido** (`max-age=63072000; includeSubDomains; preload`, solo en producción) en middleware (`security-headers.ts`) y `next.config.mjs`. `object-src 'none'` unificado en ambos; cookies de sesión ya usan `HttpOnly; SameSite=Lax; Secure` en producción (`session-cookies.ts`). Test `security-headers.test.ts`. | Queda `'unsafe-inline'` en CSP (SEC-082, P2). |
| SEC-072 Backups | 🟡 | Scripts + workflow `backup.yml`; `docs/BACKUP-DR.md`. Sin RPO/RTO probados. | Definir y probar restauración. |
| SEC-073 Respuesta a incidentes | ✅ | Runbook creado (roles, severidad, contención, notificación, ejercicios). | `docs/security/INCIDENT_RESPONSE.md`. |

---

## C. Hallazgos adicionales (controles nuevos propuestos)

- **SEC-074 — Fuga de error en `/api/health` (P1). RESUELTO.** En fallo de BD ya no se devuelve `error.message`; la respuesta es genérica y el detalle solo se registra en logs del servidor. Ver `apps/web/src/app/api/health/route.ts`.
- **SEC-075 — `/api/metrics` sin permiso (P2). RESUELTO.** Ahora exige sesión **y** el permiso `audit.read` (solo Developer/Administrador o quien lo reciba explícitamente), no solo estar autenticado. Ver `apps/web/src/app/api/metrics/route.ts`.
- **SEC-076 — Cifrado de conectores: clave por defecto (P0). RESUELTO.** Se eliminó el fallback `"default"` (y el `default` en `packages/config/src/env.ts`). El cifrado falla-cerrado si falta la clave; `CONNECTOR_ENCRYPTION_KEY` es ahora obligatoria (CI usa dummy). Ver `packages/db/src/crypto/credential-cipher.ts` y `credential-cipher.test.ts`.
- **SEC-077 — Revocación de sesiones al desactivar cuenta (P1). RESUELTO.** Desactivar un usuario (PUT/PATCH `active:false` o DELETE) ahora lo **banea en Supabase Auth** (`ban_duration`), bloqueando login y refresco de tokens; reactivar lo desbanea. Best-effort: la app ya niega acceso con `active=false`. Ver `apps/web/src/lib/users-admin.ts` (`setAuthUserBanned`) y `apps/web/src/app/api/users/[id]/route.ts`.
- **SEC-078 — Comparaciones no constantes en tokens (P2). RESUELTO.** Webhook `mensajes` (`x-webhook-token`), cron (`Bearer`) y verificación GET de Meta usan `safeEqual` (SHA-256 + `timingSafeEqual`). Ver `apps/web/src/lib/secure-compare.ts`; se conserva la idempotencia por `msgExternoId`.
- **SEC-079 — Auditar acciones administrativas (P0). RESUELTO.** Alta/edición/baja de usuarios, cambios de rol, permisos individuales y aprobación/rechazo de solicitudes escriben `activity_events` **y** `audit_events` vía `recordAdminAction` → `DrizzleAuditRepository.recordAdminEvent` (con `estadoAnterior`/`estadoNuevo`). Ver `apps/web/src/lib/audit-log.ts`.
- **SEC-080 — `role_permissions` informativo vs autoritativo (P2).** La autorización de runtime es la matriz en código; la tabla puede desincronizarse sin afectar la seguridad pero confundir auditorías. Documentar explícitamente. Evidencia: `packages/domain/src/rbac/role-permissions.ts`.
- **SEC-081 — Workers Docker sin verificación de Redis expuesto (P1). RESUELTO.** `docker-compose.yml` no publica puertos de `postgres` (sin `ports:`; solo `web` expone `3000`) y no define servicio Redis. No hay servicios internos expuestos públicamente.
- **SEC-082 — CSP `'unsafe-inline'` en `script-src` (P2).** Mitiga con nonce/hash cuando sea viable. Evidencia: `apps/web/src/lib/security-headers.ts:26-27`.
- **SEC-083 — TTL de URL firmada (P2).** Bajar el valor por defecto de 3600 s al mínimo práctico por caso de uso. Evidencia: `apps/web/src/lib/storage.ts:143`.

---

## D. Mapa de implementación (dónde se toca cada control)

| Área | Archivos clave |
| --- | --- |
| Autenticación/sesión | `apps/web/src/lib/supabase-auth.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/session-cookies.ts` |
| RBAC | `packages/domain/src/rbac/*` (`permissions.ts`, `role-permissions.ts`, `access-control.ts`) |
| Administración de usuarios | `apps/web/src/app/api/users/*`, `apps/web/src/lib/users-admin.ts` |
| Auditoría/actividad | `packages/db/src/repositories/audit-repository.ts`, `packages/db/src/schema/activity.ts` |
| Storage | `apps/web/src/lib/storage.ts`, `apps/web/src/lib/documents.ts`, `apps/worker/src/storage/*` |
| Cifrado | `packages/db/src/crypto/credential-cipher.ts` |
| Webhooks | `apps/web/src/app/api/webhooks/{meta,mensajes}/route.ts`, `apps/web/src/app/api/cron/automatizaciones/route.ts` |
| OAuth | `apps/web/src/app/api/agenda/google/*`, `apps/web/src/lib/google-calendar.ts` |
| Seguridad HTTP | `apps/web/src/middleware.ts`, `apps/web/src/lib/security-headers.ts`, `apps/web/next.config.mjs` |
| Rate limit | `apps/web/src/lib/rate-limit.ts` |
| CI/CD | `.github/workflows/ci.yml`, `.github/workflows/backup.yml`, `Dockerfile`, `Dockerfile.worker` |

---

## E. Priorización actualizada (foco)

**P0 antes de datos reales/producción**
1. SEC-076 / SEC-041 — ✅ cifrado de conectores: fallback `"default"` eliminado, falla-cerrado, versionado `v1` y rotación (`credentials:rotate`).
2. SEC-079 ✅ / SEC-050 ✅ — auditoría de acciones administrativas y de módulos de negocio (mensajería, inspecciones, plantillas, inventarios) completa.
3. SEC-020 ✅ / SEC-021 ✅ — informe RLS (`RLS_INVENTORY.md`), chequeo `rls:check` y prueba REST `rls:check:rest` (57 tablas sin exposición a anon).
4. SEC-042 ✅ — webhooks: comparación en tiempo constante (`safeEqual`) + idempotencia.
5. SEC-001 ✅ (código) / SEC-002 ✅ — inventario de datos/secretos (`SECURITY_INVENTORY.md`); `assertProductionSecrets()` cableado y endurecido (dummy/localhost/clave previa) con tests; la separación física staging/prod es operativa (§4).

**P1**
6. SEC-077 ✅ / SEC-015 🟡 — revocación de sesiones al desactivar (ban en Supabase) y contraseña mínima 12; **MFA (TOTP) completo** (enrolamiento + challenge en login + enforcement con `MFA_ENFORCE`); falta activar la flag en prod tras enrolar.
7. SEC-052 ✅ / SEC-073 ✅ — logs append-only (migración validada) + runbook de incidentes.
8. SEC-070 🟡 — `permissions` mínimos + escaneos de secretos (gitleaks) y dependencias (dependency-review); faltan escaneo de imágenes y `deploy.yml`.
9. SEC-072 🟡 — RPO/RTO definidos y scripts backup/restore presentes; **falta ejecutar el primer drill trimestral**.
10. SEC-074 ✅ / SEC-081 ✅ — `/api/health` sin fuga de error; `docker-compose` sin servicios internos expuestos.

**P2**
11. SEC-010 ✅ / SEC-071 ✅ / SEC-075 ✅ — test de cobertura de autorización, HSTS + CSP unificada y permiso en `/api/metrics`.
12. SEC-078 ✅ / SEC-080 / SEC-082 / SEC-083 — tokens en tiempo constante (hecho), documentar `role_permissions`, endurecer CSP (`unsafe-inline`) y TTL de URLs firmadas.

---

## F. Definición de terminado (sin cambios, reforzada)

Una mejora se considera implementada cuando: el código/config está modificado, existe
una prueba reproducible, se ejecuta en CI o procedimiento controlado, el resultado se
registra y la documentación refleja el comportamiento real. **Para este plan, cada
celda ✅/🟡/🔴 debe pasar a ✅ con evidencia enlazada (archivo, prueba, log o informe).**

---

**Fin — `PLAN_DE_MEJORAS_DE_SEGURIDAD_V1.1 (revisión verificada)`**
