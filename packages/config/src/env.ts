import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

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
    /**
     * Clave de cifrado de credenciales de conectores. OBLIGATORIA (SEC-041/SEC-076):
     * no hay valor por defecto. Si falta o es demasiado corta, la app falla al
     * arrancar en lugar de cifrar con una clave predecible.
     */
    CONNECTOR_ENCRYPTION_KEY: z.string().min(24),
    /**
     * Clave de cifrado anterior (solo durante una rotacion). Permite descifrar
     * credenciales cifradas con la clave previa hasta re-cifrarlas. Nunca debe
     * ser igual a la actual ni quedar configurada de forma permanente.
     */
    CONNECTOR_ENCRYPTION_KEY_PREVIOUS: z.string().min(24).optional(),
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
    GOOGLE_DRIVE_SCOPE: z
      .string()
      .default("https://www.googleapis.com/auth/drive.file"),
    /** Sitio web AlquilaYa: base de la API del sitio y credenciales admin. */
    ALQUILAYA_API_URL: z.string().url().optional(),
    ALQUILAYA_ADMIN_EMAIL: z.string().email().optional(),
    ALQUILAYA_ADMIN_PASSWORD: z.string().min(1).optional(),
    /**
     * SEC-015: exige MFA (nivel de garantía AAL2) a los roles privilegiados
     * (ADMIN/DEVELOPER). "true" lo activa. Apagado por defecto para no bloquear
     * cuentas que aún no hayan enrolado un factor en Supabase Auth.
     */
    MFA_ENFORCE: z.enum(["true", "false"]).optional(),
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

/** SEC-015: ¿exigir MFA (AAL2) a los roles privilegiados? */
export function mfaEnforce(): boolean {
  return env.MFA_ENFORCE === "true";
}

/**
 * SEC-001: en producción no se permiten secretos faltantes, con valor de
 * ejemplo/plantilla ni apuntando a recursos locales. La lógica (y sus pruebas)
 * viven en `production-secrets.ts`.
 */
export {
  assertProductionSecrets,
  collectProductionSecretProblems,
  type EnvLike,
} from "./production-secrets";

// Falla-cerrado al importar la configuración en producción (servidor web /
// worker). Se omite en `next build` y fuera de producción (ver el módulo).
import { assertProductionSecrets as assertProductionSecretsNow } from "./production-secrets";
assertProductionSecretsNow();
