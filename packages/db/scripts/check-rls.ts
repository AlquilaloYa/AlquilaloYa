import { sql } from "drizzle-orm";
import { db } from "../src/worker.js";

/**
 * SEC-020 / SEC-021 — Verificación reproducible de Row Level Security.
 *
 * Comprueba:
 *  1) Que TODA tabla del schema public tenga RLS habilitada.
 *  2) Que NO exista ninguna política que conceda acceso a los roles públicos
 *     (anon / authenticated / PUBLIC). La app no usa la REST API de Supabase:
 *     accede por conexion directa, por lo que el estado correcto es deny por
 *     defecto para los roles publicos.
 *
 * Requiere DATABASE_URL real. No forma parte de `pnpm test` (CI no tiene BD):
 * ejecutar en un entorno controlado con:
 *   pnpm --filter @contract/db rls:check
 * Sale con codigo 1 si hay algun hallazgo.
 */

interface TableRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policies: number;
}

interface PolicyRow {
  tablename: string;
  policyname: string;
  roles: string;
  cmd: string;
}

const PUBLIC_ROLES = ["anon", "authenticated", "public"];

async function main() {
  const tables = (await db.execute(sql`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           (select count(*)::int from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `)) as unknown as TableRow[];

  const policies = (await db.execute(sql`
    select tablename, policyname, roles::text as roles, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `)) as unknown as PolicyRow[];

  const problemas: string[] = [];

  const sinRls = tables.filter((t) => !t.rls_enabled);
  for (const t of sinRls) problemas.push(`RLS deshabilitada en public.${t.table_name}`);

  const publicas = policies.filter((p) =>
    p.roles
      .replace(/[{}"]/g, "")
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .some((r) => PUBLIC_ROLES.includes(r) || r === "")
  );
  for (const p of publicas) {
    problemas.push(
      `Política publica en ${p.tablename} (${p.policyname}, cmd=${p.cmd}, roles=${p.roles})`
    );
  }

  console.log(`Tablas public: ${tables.length}`);
  console.log(`  con RLS habilitada: ${tables.length - sinRls.length}`);
  console.log(`  sin RLS: ${sinRls.length}`);
  console.log(`Políticas totales: ${policies.length}`);
  console.log(`  visibles para roles publicos: ${publicas.length}`);

  if (problemas.length) {
    console.error("\nHALLAZGOS:");
    for (const p of problemas) console.error(`  ! ${p}`);
    process.exit(1);
  }

  console.log("\nOK: deny por defecto para anon/authenticated; RLS activa en todas las tablas.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fallo:", (e as Error).message);
  process.exit(1);
});
