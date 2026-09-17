import { and, count, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "../index";
import type {
  ActivityFilter,
  ActivityListItem,
  ActivityRepository,
} from "@contract/domain";

function buildWhere(filter: ActivityFilter) {
  const conditions = [];
  if (filter.userId) conditions.push(eq(schema.activity_events.userId, filter.userId));
  if (filter.action) conditions.push(eq(schema.activity_events.action, filter.action));
  if (filter.module)
    conditions.push(eq(schema.activity_events.module, filter.module));
  if (filter.entityType)
    conditions.push(eq(schema.activity_events.entityType, filter.entityType));
  if (filter.entityId)
    conditions.push(eq(schema.activity_events.entityId, filter.entityId));
  if (filter.result)
    conditions.push(eq(schema.activity_events.result, filter.result));
  if (filter.from)
    conditions.push(gte(schema.activity_events.timestamp, new Date(filter.from)));
  if (filter.to)
    conditions.push(lte(schema.activity_events.timestamp, new Date(filter.to)));
  if (filter.q) {
    const p = `%${filter.q}%`;
    conditions.push(
      or(
        ilike(schema.users.name, p),
        ilike(schema.activity_events.action, p),
        ilike(schema.activity_events.module, p),
        ilike(schema.activity_events.entityType, p),
        ilike(schema.activity_events.entityId, p)
      )
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

const SORT_COLS: Record<string, { col: PgColumn; asc: boolean } | null> = {
  fecha: { col: schema.activity_events.timestamp, asc: false },
  usuario: { col: schema.users.name, asc: true },
  accion: { col: schema.activity_events.action, asc: true },
  modulo: { col: schema.activity_events.module, asc: true },
  entidad: { col: schema.activity_events.entityId, asc: true },
  resultado: { col: schema.activity_events.result, asc: true },
};

function buildOrder(filter: ActivityFilter) {
  const key = filter.sortBy && SORT_COLS[filter.sortBy] ? filter.sortBy : "fecha";
  const meta = SORT_COLS[key]!;
  const dir = filter.sortDir ?? (meta.asc ? "asc" : "desc");
  return dir === "asc" ? asc(meta.col) : desc(meta.col);
}

export class DrizzleActivityRepository implements ActivityRepository {
  async find(filter: ActivityFilter): Promise<ActivityListItem[]> {
    const where = buildWhere(filter);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset > 0 ? filter.offset : 0;

    const rows = await db
      .select({
        id: schema.activity_events.id,
        timestamp: schema.activity_events.timestamp,
        userId: schema.activity_events.userId,
        actorType: schema.activity_events.actorType,
        action: schema.activity_events.action,
        module: schema.activity_events.module,
        entityType: schema.activity_events.entityType,
        entityId: schema.activity_events.entityId,
        result: schema.activity_events.result,
        metadata: schema.activity_events.metadata,
        userName: schema.users.name,
      })
      .from(schema.activity_events)
      .leftJoin(
        schema.users,
        eq(schema.activity_events.userId, schema.users.id)
      )
      .where(where)
      .orderBy(buildOrder(filter))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.userId,
      actorType: r.actorType,
      action: r.action,
      module: r.module,
      entityType: r.entityType,
      entityId: r.entityId,
      result: r.result,
      metadata: r.metadata as Record<string, unknown> | null,
      userName: r.userName,
    }));
  }

  async count(filter: ActivityFilter): Promise<number> {
    const where = buildWhere(filter);
    const [row] = await db
      .select({ value: count() })
      .from(schema.activity_events)
      .where(where);
    return row?.value ?? 0;
  }

  async findRecent(limit = 20): Promise<ActivityListItem[]> {
    return this.find({ limit, offset: 0 });
  }
}