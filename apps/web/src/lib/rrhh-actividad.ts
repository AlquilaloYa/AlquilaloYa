import { ActivityModule, ActivityAction, ActivityResult } from "@contract/domain/activity";

type Db = typeof import("@contract/db").db;
type Schema = typeof import("@contract/db").schema;

type EventoHR = {
  actorId?: string | null;
  actorName: string;
  action: (typeof ActivityAction)[keyof typeof ActivityAction];
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  result?: (typeof ActivityResult)[keyof typeof ActivityResult];
};

/**
 * §15 — Escribe la operación RRHH en los DOS registros:
 * - activity_events: trazabilidad funcional para la UI.
 * - audit_events: registro de seguridad (SEC-050).
 *
 * Es best-effort y nunca debe romper la operación que acaba de tener éxito:
 * si falla, se traga el error. Nunca se persisten secretos en metadata.
 */
export async function registrarActividadHR(
  db: Db,
  schema: Schema,
  evento: EventoHR
): Promise<void> {
  const result = evento.result ?? ActivityResult.SUCCESS;
  const metadata: Record<string, unknown> = {
    actor: evento.actorName,
    ...(evento.metadata ?? {}),
  };
  try {
    await db.insert(schema.activity_events).values({
      userId: evento.actorId ?? null,
      actorType: "USER",
      action: evento.action,
      module: ActivityModule.HR,
      entityType: "EMPLOYEE",
      entityId: evento.entityId ?? null,
      result,
      metadata,
    });
    await db.insert(schema.audit_events).values({
      usuario: evento.actorName,
      accion: evento.action,
      entidad: "EMPLOYEE",
      resultado: result,
      metadataSegura: {
        module: ActivityModule.HR,
        entityId: evento.entityId ?? null,
        actorUserId: evento.actorId ?? null,
        ...(evento.metadata ?? {}),
      },
    });
  } catch {
    // El registro de auditoría es best-effort: no bloquea el alta ni la edición.
  }
}
