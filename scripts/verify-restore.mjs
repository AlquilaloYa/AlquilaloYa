import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

// Verifica conteos mínimos tras una restauración (prueba de DR).
// Uso: DATABASE_URL="..." node scripts/verify-restore.mjs
//      Sin DATABASE_URL lee de apps/web/.env para comodidad local.

const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  try {
    const envText = readFileSync(join(here, "../apps/web/.env"), "utf-8");
    for (const line of envText.split("\n")) {
      const m = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
    }
  } catch {
    /* no .env local; se exigirá DATABASE_URL abajo */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definida");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const tables = ["clients", "departments", "contracts", "contract_snapshots"];

try {
  let ok = true;
  for (const t of tables) {
    const [row] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
    const n = row?.n ?? 0;
    console.log(`${t}: ${n} filas`);
    if (n === 0) ok = false;
  }
  console.log(ok ? "OK: restauracion con datos." : "AVISO: tablas vacias.");
  process.exitCode = ok ? 0 : 2;
} catch (e) {
  console.error("Error al verificar:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
