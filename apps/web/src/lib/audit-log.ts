import type { ResolvedUser } from "@/lib/session";

type DbModule = typeof import("@contract/db");

export interface AdminActionInput {
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  result?: "SUCCESS" | "FAILURE";
  /** Estado previo (solo datos seguros: sin secretos). */
  previous?: Record<string, unknown> | null;
  /** Estado nuevo (solo datos seguros: sin secretos). */
  current?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Registra una acción administrativa o sensible en activity_events y
 * audit_events (SEC-050/SEC-079). La auditoría NUNCA debe bloquear la operación:
 * si falla, se ignora. Nunca se deben pasar secretos (tokens, contraseñas).
 */
export async function recordAdminAction(
  dbModule: DbModule,
  actor: ResolvedUser,
  input: AdminActionInput
): Promise<void> {
  try {
    const audit = new dbModule.DrizzleAuditRepository();
    await audit.recordAdminEvent({
      actor: { userId: actor.id, name: actor.name },
      ...input,
    });
  } catch {
    /* la auditoría no debe romper el flujo principal */
  }
}
