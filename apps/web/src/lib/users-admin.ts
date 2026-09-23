import { randomBytes } from "node:crypto";
import { env } from "@contract/config/env";
import { supabaseUrl } from "@contract/config/env";

/**
 * Admin API de Supabase Auth (service role) para crear/actualizar usuarios de
 * la app (email + contraseña). Mismo patrón REST que lib/storage.ts y el
 * script packages/db/scripts/create-app-users.ts.
 */

const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

export function isUsersAdminConfigured(): boolean {
  return Boolean(supabaseUrl() && SERVICE_KEY);
}

function adminHeaders(): Record<string, string> {
  if (!isUsersAdminConfigured()) {
    throw new Error(
      "Admin de usuarios no configurado: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

export function generatePassword(): string {
  // ~15 caracteres, legible y fuerte (mismo formato que create-app-users.ts).
  return "Ss!" + randomBytes(9).toString("base64url");
}

async function findAuthUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl()}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: adminHeaders(), cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`list auth users ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { users?: Array<{ id?: string; email?: string }> };
  const found = (data.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  return found?.id ?? null;
}

/** Busca la credencial de auth de un email. Devuelve id o null. */
export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string } | null> {
  const id = await findAuthUserId(email);
  return id ? { id } : null;
}

/** Actualiza email + contraseña en Supabase Auth (si la credencial existe). */
export async function updateAuthEmail(
  currentEmail: string,
  newEmail: string
): Promise<void> {
  const id = await findAuthUserId(currentEmail);
  if (!id) return;
  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ email: newEmail, email_confirm: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`update auth user ${res.status}: ${await res.text()}`);
  }
}

/** Crea la credencial en Supabase Auth. Devuelve el id de auth o null si existe. */
export async function createAuthUser(
  email: string,
  password: string
): Promise<{ created: boolean; authUserId?: string }> {
  const existing = await findAuthUserId(email);
  if (existing) return { created: false, authUserId: existing };
  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`create auth user ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  return { created: true, ...(data.id ? { authUserId: data.id } : {}) };
}

/** Actualiza la contraseña en Supabase Auth (si el usuario existe). */
export async function updateAuthPassword(email: string, password: string): Promise<void> {
  const id = await findAuthUserId(email);
  if (!id) return;
  const res = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ password }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`update auth user ${res.status}: ${await res.text()}`);
  }
}