import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "../../../apps/web/.env"), "utf-8");
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const EMAILS = [
  "admin@sistema.com","operador@sistema.com","supervisor@sistema.com","auditor@sistema.com","firmante@sistema.com",
  "maria.gomez@sistema.com","carlos.rojas@sistema.com","lucia.mendez@sistema.com","pedro.sanchez@sistema.com","ana.torres@sistema.com",
];

const url = process.env.DATABASE_URL;
const sql = postgres(url, { max: 1 });
const dbRows = await sql`SELECT email, role, active FROM users ORDER BY email`;
await sql.end();

const dbByEmail = Object.fromEntries(dbRows.map((r) => [r.email, r]));

const su = process.env.SUPABASE_URL;
const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${su}/auth/v1/admin/users?page=1&per_page=1000`, {
  headers: { apikey: sk, Authorization: `Bearer ${sk}` },
});
const data = await res.json();
const authArr = Array.isArray(data) ? data : (data.users ?? []);
const authEmails = new Set(authArr.map((u) => (u.email || "").toLowerCase()));

console.log("email                          | users.tbl | supabaseAuth");
console.log("-------------------------------+-----------+-------------");
for (const e of EMAILS) {
  const inDb = dbByEmail[e] ? "  OK " + dbByEmail[e].role.padEnd(10) : "  FALTA";
  const inAuth = authEmails.has(e) ? "OK" : "FALTA";
  console.log(`${e.padEnd(30)} | ${inDb}  | ${inAuth}`);
}
console.log(`\nTotal en tabla users: ${dbRows.length} | usuarios Supabase Auth: ${authArr.length}`);
process.exit(0);
