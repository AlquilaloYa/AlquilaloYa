import { sql } from "drizzle-orm";
import { db } from "../src/worker.js";

/**
 * SEC-021 — Prueba de RLS **por REST** (PostgREST de Supabase).
 *
 * Complementa a `check-rls.ts` (que verifica a nivel de catálogo que RLS esté
 * activa y no haya políticas públicas). Aquí se comprueba el comportamiento
 * real de la API REST que Supabase expone con la clave **anónima** y, si se
 * provee, con un token de sesión real:
 *
 *   - rol `anon`: cada tabla debe quedar invisible (0 filas) o denegada (401/403).
 *   - token de usuario (`RLS_TEST_BEARER`, opcional): si el JWT es de un usuario
 *     `authenticated`, tampoco debe ver datos sin políticas.
 *
 * La app NO usa PostgREST para sus datos (accede por conexión directa), por lo
 * que el estado correcto es deny por defecto para anon/authenticated.
 *
 * Requiere `SUPABASE_URL` y `SUPABASE_ANON_KEY` (o `NEXT_PUBLIC_*`) y conexión
 * de red. Ejecutar:
 *   pnpm --filter @contract/db rls:check:rest
 * Con un token real (opcional):
 *   $env:RLS_TEST_BEARER = "<access_token de un usuario autenticado>"
 * Sale con código 1 si alguna tabla expone filas a un rol no privilegiado.
 */

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const bearerToken = process.env.RLS_TEST_BEARER?.trim() || undefined;

interface ProbeResult {
  status: number;
  rows: number;
  networkError?: string;
}

async function listPublicTables(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `)) as unknown as { table_name: string }[];
  return rows.map((r) => r.table_name);
}

async function probe(table: string, token: string): Promise<ProbeResult> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,
    {
      headers: {
        apikey: anonKey as string,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  if (res.status === 401 || res.status === 403) {
    return { status: res.status, rows: 0 };
  }
  if (!res.ok) {
    return { status: res.status, rows: -1 };
  }
  const body = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, rows: Array.isArray(body) ? body.length : -1 };
}

async function main() {
  if (!supabaseUrl || !anonKey) {
    console.error(
      "Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY (o NEXT_PUBLIC_*). Abortando."
    );
    process.exit(2);
  }

  const tables = await listPublicTables();
  const roles: { name: string; token: string }[] = [
    { name: "anon", token: anonKey as string },
  ];
  if (bearerToken) {
    roles.push({ name: "authenticated(bearer)", token: bearerToken });
  }

  console.log(`REST RLS — ${tables.length} tablas public × ${roles.length} rol(es)`);
  if (!bearerToken) {
    console.log(
      "  (define RLS_TEST_BEARER con un access_token real para probar authenticated)\n"
    );
  }

  const hallazgos: string[] = [];
  let probadas = 0;

  for (const role of roles) {
    for (const table of tables) {
      let result: ProbeResult;
      try {
        result = await probe(table, role.token);
      } catch (e) {
        result = { status: 0, rows: -1, networkError: (e as Error).message };
      }
      probadas += 1;
      if (result.networkError) {
        hallazgos.push(
          `${role.name} ${table}: error de red (${result.networkError})`
        );
        continue;
      }
      if (result.rows > 0) {
        hallazgos.push(
          `${role.name} ${table}: EXPONE ${result.rows} fila(s) (status ${result.status})`
        );
      }
    }
  }

  console.log(`Peticiones realizadas: ${probadas}`);
  if (hallazgos.length) {
    console.error("\nHALLAZGOS (posible fuga por REST):");
    for (const h of hallazgos) console.error(`  ! ${h}`);
    process.exit(1);
  }

  console.log(
    "\nOK: ninguna tabla expone filas a anon" +
      (bearerToken ? " ni al token de usuario provisto" : "") +
      " vía PostgREST."
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("Fallo:", (e as Error).message);
  process.exit(1);
});
