# Inventario y verificación de RLS — AlquilaYa ERP

**Controles:** SEC-020 (auditar RLS), SEC-021 (probar RLS)
**Fecha:** 2026-10-10
**Entorno verificado:** base de datos de desarrollo (conexión directa `DATABASE_URL`)

> Comando reproducible: `pnpm --filter @contract/db rls:check`
> (script `packages/db/scripts/check-rls.ts`; requiere `DATABASE_URL` real, no
> forma parte de `pnpm test` porque CI no tiene base de datos).

---

## 1. Modelo de acceso (contexto)

- La aplicación accede a Postgres por **conexión directa** (Drizzle / driver
  `postgres`) con un rol que es **propietario de las tablas / `BYPASSRLS`**, y
  para Storage/Auth usa la **`service_role`** de Supabase.
- La app **no consume la REST API de Supabase** (`/rest/v1/**`) con `anon` ni
  `authenticated`.
- Supabase instala el event trigger `ensure_rls` que habilita RLS
  automáticamente en cada `CREATE TABLE` del schema `public`
  (ver `supabase/migrations/0039_rls_auto_enable_solo_admin.sql`).

Consecuencia buscada: para los roles públicos (`anon`, `authenticated`), RLS
habilitada **sin políticas** equivale a **deny por defecto** (no leen ni
escriben nada), mientras la app sigue operando como propietario.

---

## 2. Resultado del chequeo (2026-10-10)

| Métrica | Valor |
| --- | --- |
| Tablas en `public` (`relkind='r'`) | 57 |
| Con RLS habilitada (`relrowsecurity=true`) | 57 |
| **Sin RLS** | **0** |
| Políticas totales (`pg_policies`) | 0 |
| Políticas visibles para `anon`/`authenticated`/`PUBLIC` | **0** |

**Veredicto: ✅ deny por defecto para roles públicos; RLS activa en el 100 % de
las tablas.**

Tablas verificadas (57): `activity_events`, `annex_versions`, `annexes`,
`attendance`, `audit_events`, `automation_rules`, `automation_runs`, `bot_rules`,
`clause_versions`, `clauses`, `clients`, `connector_credentials`,
`connector_instances`, `connector_logs`, `contacts`, `contract_snapshots`,
`contracts`, `conversations`, `department_inventories`, `departments`,
`documents`, `hr_departments`, `hr_employee_documents`, `hr_employee_history`,
`hr_employees`, `hr_employments`, `hr_onboarding_processes`,
`hr_onboarding_tasks`, `hr_organizations`, `hr_positions`, `hr_requests`,
`hr_sites`, `hr_teams`, `inspection_questions`, `inspection_templates`,
`inspections`, `inventario_catalogo`, `leads`, `message_templates`, `messages`,
`payments`, `permission_requests`, `permissions`, `role_permissions`,
`separations`, `tasks`, `template_departments`, `template_versions`, `templates`,
`user_google_tokens`, `user_permissions`, `users`, `work_order_assignments`,
`work_order_attachments`, `work_order_events`, `work_order_visits`, `work_orders`.

---

## 3. Consulta usada (referencia)

```sql
-- RLS por tabla
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Políticas y roles destinatarios
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

---

## 4. Hallazgos y decisiones

1. **Sin políticas (intencional).** Al no exponer la REST API, la ausencia de
   políticas es el estado más seguro: deny por defecto. Si en el futuro se
   habilita acceso directo (`anon`/`authenticated`), **cada tabla necesitará
   políticas explícitas y pruebas con tokens reales** (SEC-021 abierto para ese
   escenario).
2. **`relforcerowsecurity = false`.** El propietario de la tabla (rol de la app)
   no está sujeto a RLS. Es lo esperado y necesario para que la app opere; el
   aislamiento de datos se resuelve en la capa de autorización de la aplicación
   (`requireUser` + `requirePermission`, ver SEC-010/SEC-014).
3. **Aislamiento multi-inquilino.** No hay columna de organización usada en RLS;
   el aislamiento por usuario/rol es responsabilidad de la app. Auditar
   recurso por recurso sigue en SEC-014.
4. **Exposición de `rls_auto_enable()`.** Revocada a `anon`/`authenticated`/
   `service_role` en la migración `0039` (SEC-022 parcial).

---

## 5. Verificación continua

Ejecutar `rls:check` en cada entorno tras aplicar migraciones. El script falla
(exit 1) si:
- alguna tabla de `public` queda **sin RLS**, o
- aparece una **política que conceda acceso a `anon`/`authenticated`/`PUBLIC`**.

---

**Fin — Inventario RLS (SEC-020/SEC-021).**
