import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  AuditEvent,
  AuditFilter,
  ContractDomainEvent,
  DomainEventSink,
} from "@contract/domain";

export interface AuditActor {
  userId?: string | null;
  name?: string | null;
}

/**
 * Persiste los eventos de dominio de contratos en activity_events/audit_events
 * como trazabilidad para la auditoría.
 */
export class DrizzleAuditRepository {
  async recordContractEvent(
    event: ContractDomainEvent,
    actor?: AuditActor
  ): Promise<void> {
    const action = event.type as string;
    const module = "CONTRACTS";
    const entityType = "CONTRACT";
    const usuario = actor?.name?.trim() || "system";
    const userId = actor?.userId ?? null;
    const actorType = userId ? "user" : "system";

    await db.insert(schema.activity_events).values({
      timestamp: new Date(event.ocurridoEn),
      userId,
      actorType,
      action,
      module,
      entityType,
      entityId: event.contractId,
      result: "SUCCESS",
      metadata: {
        snapshotId: event.snapshotId,
        estadoAnterior: event.estadoAnterior,
        estadoNuevo: event.estadoNuevo,
      } as Record<string, unknown>,
    });

    await db.insert(schema.audit_events).values({
      usuario,
      accion: action,
      entidad: entityType,
      estadoAnterior: { estado: event.estadoAnterior } as Record<string, unknown>,
      estadoNuevo: event.estadoNuevo
        ? ({ estado: event.estadoNuevo } as Record<string, unknown>)
        : undefined,
      resultado: "SUCCESS",
      metadataSegura: {
        contractId: event.contractId,
        snapshotId: event.snapshotId,
      } as Record<string, unknown>,
    });
  }

  async find(filter: AuditFilter): Promise<AuditEvent[]> {
    const conditions = [];
    if (filter.usuario) conditions.push(eq(schema.audit_events.usuario, filter.usuario));
    if (filter.accion) conditions.push(eq(schema.audit_events.accion, filter.accion));
    if (filter.entidad)
      conditions.push(eq(schema.audit_events.entidad, filter.entidad));
    if (filter.from)
      conditions.push(gte(schema.audit_events.fecha, new Date(filter.from)));
    if (filter.to)
      conditions.push(lte(schema.audit_events.fecha, new Date(filter.to)));
    const where = conditions.length ? and(...conditions) : undefined;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset > 0 ? filter.offset : 0;

    const rows = await db
      .select()
      .from(schema.audit_events)
      .where(where)
      .orderBy(desc(schema.audit_events.fecha))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      usuario: r.usuario,
      fecha: r.fecha,
      accion: r.accion,
      entidad: r.entidad,
      estadoAnterior: r.estadoAnterior as Record<string, unknown> | null,
      estadoNuevo: r.estadoNuevo as Record<string, unknown> | null,
      resultado: r.resultado,
      metadataSegura: r.metadataSegura as Record<string, unknown> | null,
    }));
  }

  async count(filter: AuditFilter): Promise<number> {
    const conditions = [];
    if (filter.usuario) conditions.push(eq(schema.audit_events.usuario, filter.usuario));
    if (filter.accion) conditions.push(eq(schema.audit_events.accion, filter.accion));
    if (filter.entidad)
      conditions.push(eq(schema.audit_events.entidad, filter.entidad));
    if (filter.from)
      conditions.push(gte(schema.audit_events.fecha, new Date(filter.from)));
    if (filter.to)
      conditions.push(lte(schema.audit_events.fecha, new Date(filter.to)));
    const where = conditions.length ? and(...conditions) : undefined;
    const [row] = await db
      .select({ value: count() })
      .from(schema.audit_events)
      .where(where);
    return row?.value ?? 0;
  }
}

/** Sink de eventos que persiste cada evento de dominio de contratos. */
export function createAuditSink(
  repo: DrizzleAuditRepository,
  actor?: AuditActor
): DomainEventSink {
  return async (event) => {
    await repo.recordContractEvent(event, actor);
  };
}