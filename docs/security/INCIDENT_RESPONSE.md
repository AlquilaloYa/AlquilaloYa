# Respuesta a incidentes de seguridad — AlquilaYa ERP

**Control:** SEC-073 · **Fecha:** 2026-10-10

Guía operativa para detectar, contener, erradicar y recuperarse de un incidente
de seguridad. Mantener viva: revisar semestralmente y tras cada incidente real.

---

## 1. Roles

| Rol | Responsabilidad |
| --- | --- |
| Responsable de incidente | Coordina, decide y comunica. |
| Responsable técnico | Aplica contención/erradicación en infra y código. |
| Responsable de negocio/legal | Decide notificaciones a afectados/autoridad. |

Con equipo reducido, una misma persona puede cubrir varios roles; aun así,
**registrar** quién hizo qué y cuándo.

---

## 2. Clasificación de severidad

| Nivel | Criterio | Respuesta |
| --- | --- | --- |
| **SEV-1** | Acceso no autorizado a datos/PII o secretos; compromiso de admin; fuga masiva. | Inmediata, 24/7. |
| **SEV-2** | Intento de acceso/abuso relevante; vulnerabilidad explotable sin datos confirmados. | Mismo día laborable. |
| **SEV-3** | Hallazgo de baja explotabilidad (config, higiene). | Backlog con fecha. |

---

## 3. Ciclo de respuesta

### 3.1 Detección

Fuentes: alertas de `audit_events`/`activity_events` (acciones admin
anómalas), fallos de login repetidos, CI de seguridad (gitleaks/dependency
review), avisos del proveedor (Supabase/Vercel/Meta), reporte de un usuario.

### 3.2 Contención (primeros minutos)

1. **No borrar evidencia.** Anotar hora UTC, qué se observó y cómo.
2. Aislar según el caso:
   - Cuenta comprometida → desactivar usuario (`active=false` en `users`;
     además banea en Supabase Auth, ver SEC-077) y **rotar** su contraseña.
   - Token/credencial de integración filtrado → eliminar/reemplazar en
     `connector_credentials` (cifradas) y regenrar en el proveedor.
   - Clave de cifrado comprometida → rotar con
     `pnpm --filter @contract/db credentials:rotate` (SEC-041).
   - Acceso a la BD/Storage → rotar `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
     claves de bucket; revisar logs de Supabase.
   - Endpoint vulnerable → desplegar mitigación (feature flag / 403 temporal).
3. Si hay secretos en el repo → **inmediato**: rotar el secreto afectado
   (el historial de git conserva el valor).

### 3.3 Erradicación

Corregir la causa raíz (parche, migración, cambio de política), añadir una
prueba que prevenga la regresión (test/check en CI) y desplegar.

### 3.4 Recuperación

Verificar servicio (`/api/health`), integridad de datos y que el vector quedó
cerrado. Restaurar desde backup si hubo corrupción (`docs/BACKUP-DR.md`).

### 3.5 Post-incidente (≤ 7 días)

- Redactar post-mortem sin culpables: línea temporal, causa raíz, impacto,
  detección, acciones y responsables con fecha.
- Guardar el registro en `docs/security/incidents/AAAA-MM-DD-<slug>.md`.
- Convertir cada acción en tarea del plan (`PLAN_DE_MEJORAS_DE_SEGURIDAD`).

---

## 4. Notificación

- **SEV-1 con PII**: evaluar obligación legal de notificar a afectados y a la
  autoridad de protección de datos aplicable, en los plazos legales.
- Comunicar a los stakeholders internos; no comunicar públicamente sin revisar
  hechos y alcance.

---

## 5. Contactos y accesos (completar por entorno)

| Recurso | Contacto / panel | Notas |
| --- | --- | --- |
| Supabase | panel del proyecto | Rotar keys, revisar logs Auth/Storage. |
| Vercel | panel del proyecto | Rotar env vars, revisar despliegues. |
| Meta / WhatsApp | Business Manager | Rotar tokens, revisar webhooks. |
| Google Cloud | OAuth client | Rotar `GOOGLE_CLIENT_SECRET`. |
| Hosting DB | panel Postgres | Rotar contraseña, backups. |

> **No** anotar secretos en este documento. Los accesos se custodian en el
> gestor de secretos (ver `SECURITY_INVENTORY.md`).

---

## 6. Ejercicios (tabletop)

Una vez por semestre, simular: (a) fuga de `SUPABASE_SERVICE_ROLE_KEY`,
(b) cuenta admin comprometida, (c) secreto commiteado. Registrar fecha y
lecciones en la tabla siguiente.

| Fecha | Escenario | Resultado | Acciones |
| --- | --- | --- | --- |
| — | — | (pendiente primer ejercicio) | — |

---

**Fin — Runbook de respuesta a incidentes (SEC-073).**
