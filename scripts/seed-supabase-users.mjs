import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Aprisiona (provisiona) los usuarios de la app en Supabase Auth mediante la
 * API de administración (service role). Idempotente: si el email ya existe,
 * actualiza la contraseña; si no, lo crea confirmado.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPABASE_USERS_PASSWORD="ClaveSegura!" \
 *   node scripts/seed-supabase-users.mjs
 *
 * Leee apps/web/.env si las vars no vienen definidas.
 */

const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envText = readFileSync(join(here, "../apps/web/.env"), "utf-8");
    for (const line of envText.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* sin .env local */
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SUPABASE_USERS_PASSWORD;

if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!password || password.length < 6) {
  console.error("Define SUPABASE_USERS_PASSWORD (>=6 chars) con la contraseña inicial común.");
  process.exit(1);
}

const USERS = [
  "admin@sistema.com",
  "operador@sistema.com",
  "supervisor@sistema.com",
  "auditor@sistema.com",
  "firmante@sistema.com",
];

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function listByEmail(email) {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`list users ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : data.users ?? [];
  return arr.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) ?? null;
}

async function main() {
  for (const email of USERS) {
    const existing = await listByEmail(email);
    if (existing) {
      const up = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ password }),
        cache: "no-store",
      });
      console.log(`${up.ok ? "✓ contraseña actualizada" : "✗"} ${email} (${up.status})`);
    } else {
      const cr = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password, email_confirm: true }),
        cache: "no-store",
      });
      if (!cr.ok) {
        console.log(`✗ ${email}: ${cr.status} ${await cr.text()}`);
      } else {
        const created = await cr.json();
        console.log(`+ creado ${email} (id ${created.id})`);
      }
    }
  }
  console.log("\nListo. En Supabase Dashboard → Auth, desactiva 'Confirm email' si quieres login inmediato.");
}

main().catch((e) => {
  console.error("Fallo:", e.message);
  process.exit(1);
});
