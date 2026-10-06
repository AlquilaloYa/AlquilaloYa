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
 * §15 — Escribe la operación RRHH en el registro genérico de actividad.
 *
 * El registro de auditoría es de solo escritura para la UI y nunca debe romper
 * la operación que acaba de tener éxito: si falla, se traga el error.
 */
export async function registrarActividadHR(
  db: Db,
  schema: Schema,
  evento: EventoHR
): Promise<void> {
  try {
    await db.insert(schema.activity_events).values({
      userId: evento.actorId ?? null,
      actorType: "USER",
      action: evento.action,
      module: ActivityModule.HR,
      entityType: "EMPLOYEE",
      entityId: evento.entityId ?? null,
      result: evento.result ?? ActivityResult.SUCCESS,
      metadata: {
        actor: evento.actorName,
        ...(evento.metadata ?? {}),
      },
    });
  } catch {
    // El registro de actividad es best-effort: no bloquea el alta ni la edición.
  }
}
