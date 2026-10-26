/**
 * SEC-001 — Guardas de arranque para producción.
 *
 * `assertProductionSecrets()` aborta el arranque si, en producción, faltan
 * secretos críticos o si alguno tiene un valor de ejemplo/plantilla (los
 * dummies de CI) o apunta a un recurso local. Es intencionalmente
 * "falla-cerrado": es preferible no arrancar antes que correr con credenciales
 * predecibles o contra la base de datos equivocada.
 *
 * Vive en su propio módulo (sin importar `env.ts`) para poder probarse con
 * `process.env` sintético y sin disparar la validación de `@t3-oss/env-core`.
 */

export type EnvLike = Record<string, string | undefined>;

/**
 * Valores típicos de ejemplo/plantilla que NUNCA deben usarse en producción
 * (incluye los dummies de CI, p. ej. `ci-connector-encryption-key-...`).
 */
const PLACEHOLDER_VALUE =
  /(changeme|change[-_ ]?me|placeholder|dummy|example|sample|redacted|not[-_]?a[-_]?real|^default$|^secret$|^password$|ci-connector)/i;

/** Caracteres repetidos (p. ej. `00000000`) que delatan un valor no aleatorio. */
const REPEATED_RUN = /(.)\1{7,}/;

function firstDefined(env: EnvLike, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function looksLikePlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUE.test(value) || REPEATED_RUN.test(value);
}

/**
 * Devuelve la lista de problemas detectados (vacía si todo está correcto).
 * No depende del `NODE_ENV`: el llamador decide cuándo aplica a producción.
 */
export function collectProductionSecretProblems(env: EnvLike = process.env): string[] {
  const problems: string[] = [];

  const supabaseUrl = firstDefined(env, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = firstDefined(
    env,
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
  const encryptionKey = firstDefined(env, "CONNECTOR_ENCRYPTION_KEY");
  const clientChatEncryptionKey = firstDefined(env, "CLIENT_CHAT_ENCRYPTION_KEY");
  const previousKey = firstDefined(env, "CONNECTOR_ENCRYPTION_KEY_PREVIOUS");
  const databaseUrl = firstDefined(env, "DATABASE_URL");

  if (!supabaseUrl) {
    problems.push("falta SUPABASE_URL");
  } else if (isLoopback(supabaseUrl)) {
    problems.push("SUPABASE_URL apunta a localhost (no es un entorno de producción)");
  } else if (looksLikePlaceholder(supabaseUrl)) {
    problems.push("SUPABASE_URL parece un valor de ejemplo/plantilla");
  }

  if (!anonKey) {
    problems.push("falta SUPABASE_ANON_KEY");
  } else if (looksLikePlaceholder(anonKey)) {
    problems.push("SUPABASE_ANON_KEY parece un valor de ejemplo/plantilla");
  }

  if (!encryptionKey) {
    problems.push("falta CONNECTOR_ENCRYPTION_KEY (el cifrado de credenciales no está configurado)");
  } else if (looksLikePlaceholder(encryptionKey)) {
    problems.push("CONNECTOR_ENCRYPTION_KEY parece un valor de ejemplo/plantilla");
  }

  if (!clientChatEncryptionKey) {
    problems.push("falta CLIENT_CHAT_ENCRYPTION_KEY (el cifrado del chat del portal no está configurado)");
  } else if (clientChatEncryptionKey.length < 32) {
    problems.push("CLIENT_CHAT_ENCRYPTION_KEY debe tener al menos 32 caracteres");
  } else if (looksLikePlaceholder(clientChatEncryptionKey)) {
    problems.push("CLIENT_CHAT_ENCRYPTION_KEY parece un valor de ejemplo/plantilla");
  }

  if (previousKey) {
    problems.push("CONNECTOR_ENCRYPTION_KEY_PREVIOUS no debe permanecer configurada tras rotar");
  }

  if (databaseUrl && isLoopback(databaseUrl)) {
    problems.push("DATABASE_URL apunta a localhost (no es un entorno de producción)");
  }

  return problems;
}

/**
 * Aborta si el entorno es producción y los secretos están mal configurados.
 * Se omite durante `next build` (los módulos se evalúan antes de tener los
 * secretos reales) y en cualquier entorno que no sea producción.
 */
export function assertProductionSecrets(env: EnvLike = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;

  const problems = collectProductionSecretProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Secretos de producción mal configurados (SEC-001): ${problems.join("; ")}`
    );
  }
}
