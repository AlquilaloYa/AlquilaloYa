import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const CONNECTOR_KEY_DEFAULT = "change-me-32-bytes-encryption-key-0000";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** Clave anónima/publishable para validar tokens de Supabase Auth. */
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default("documents"),
    REDIS_URL: z.string().url().optional(),
    CONNECTOR_ENCRYPTION_KEY: z.string().min(24).default(CONNECTOR_KEY_DEFAULT),
    /** Google Calendar (agenda personal por usuario). Se configuraran despues. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    GOOGLE_CALENDAR_SCOPE: z
      .string()
      .default("https://www.googleapis.com/auth/calendar.events"),
    GOOGLE_GMAIL_SCOPE: z
      .string()
      .default("https://www.googleapis.com/auth/gmail.send"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

/** La anon key puede venir en NEXT_PUBLIC_* si no se definió la de server. */
export function supabaseAnonKey(): string | undefined {
  return (
    env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
export function supabaseUrl(): string | undefined {
  return env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * En producción no se permiten secretos con valor por defecto (predecibles).
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (env.CONNECTOR_ENCRYPTION_KEY === CONNECTOR_KEY_DEFAULT) {
    problems.push("CONNECTOR_ENCRYPTION_KEY");
  }
  if (!supabaseUrl()) problems.push("SUPABASE_URL");
  if (!supabaseAnonKey()) problems.push("SUPABASE_ANON_KEY");
  if (problems.length) {
    throw new Error(
      `Secretos de producción sin configurar: ${problems.join(", ")}`
    );
  }
}
