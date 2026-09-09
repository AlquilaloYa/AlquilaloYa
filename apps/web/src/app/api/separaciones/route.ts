import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type SepBody = {
  departamentoId?: string;
  contactoId?: string | null;
  montoSeparacion?: number;
  tipoSeparacion?: "500" | "TOTAL" | "FLUCTUANTE";
  garantiaExtendida?: boolean;
  baucherGarantiaExtendida?: string | null;
  fechaGarantiaExtendida?: string | null;
  fechaSeparacion?: string;
  diasTiempo?: number | null;
  fechaLimiteManual?: string | null;
  baucherSeparacion?: string | null;
  estado?: string;
};

function limites(fechaSeparacion: string | Date) {
  const base = new Date(fechaSeparacion).getTime();
  const h = (n: number) => new Date(base + n * 3600000).toISOString();
  return { fechaLimite48h: h(48), fechaLimite120h: h(120), fechaLimite168h: h(168) };
}

function toView(r: {
  id: string;
  departamentoId: string;
  contactoId: string | null;
  montoSeparacion: string | number;
  tipoSeparacion: string;
  garantiaExtendida: boolean;
  baucherGarantiaExtendida: string | null;
  fechaGarantiaExtendida: Date | null;
  fechaSeparacion: Date;
  diasTiempo: number | null;
  fechaLimiteManual: Date | null;
  baucherSeparacion: string | null;
  estado: string;
}) {
  return {
    id: r.id,
    departamentoId: r.departamentoId,
    contactoId: r.contactoId,
    montoSeparacion: Number(r.montoSeparacion),
    tipoSeparacion: r.tipoSeparacion,
    garantiaExtendida: r.garantiaExtendida,
    baucherGarantiaExtendida: r.baucherGarantiaExtendida ?? null,
    fechaGarantiaExtendida: r.fechaGarantiaExtendida?.toISOString?.() ?? null,
    fechaSeparacion: r.fechaSeparacion.toISOString(),
    diasTiempo: r.diasTiempo ?? undefined,
    fechaLimiteManual: r.fechaLimiteManual?.toISOString?.() ?? null,
    ...limites(r.fechaSeparacion),
    baucherSeparacion: r.baucherSeparacion ?? "",
    estado: r.estado,
  };
}

async function dbAndSchema(permission: Permission, req: Request) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return { error: auth.error };
  const denied = requirePermission(auth.user.role, permission);
  if (denied) return { error: denied };
  const { db, schema } = dbModule as {
    db: typeof import("@contract/db").db;
    schema: typeof import("@contract/db").schema;
  };
  return { db, schema };
}

/** GET /api/separaciones */
export async function GET(req: Request) {
  try {
    const ctx = await dbAndSchema(Permission.DEPARTMENT_READ, req);
    if ("error" in ctx) return ctx.error;
    const rows = await ctx.db.select().from(ctx.schema.separations);
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST/PUT /api/separaciones — upsert por departamento (1 activa por depto). */
export async function POST(req: Request) {
  return upsert(req);
}
export async function PUT(req: Request) {
  return upsert(req);
}

async function upsert(req: Request) {
  try {
    const ctx = await dbAndSchema(Permission.DEPARTMENT_UPDATE, req);
    if ("error" in ctx) return ctx.error;
    const body = (await req.json()) as SepBody;
    if (!body.departamentoId) {
      return NextResponse.json({ error: "Falta departamentoId" }, { status: 400 });
    }
    const values = {
      departamentoId: body.departamentoId,
      contactoId: body.contactoId || null,
      montoSeparacion: String(body.montoSeparacion ?? 500),
      tipoSeparacion: body.tipoSeparacion ?? "500",
      garantiaExtendida: Boolean(body.garantiaExtendida),
      baucherGarantiaExtendida: body.baucherGarantiaExtendida || null,
      fechaGarantiaExtendida: body.fechaGarantiaExtendida
        ? new Date(body.fechaGarantiaExtendida)
        : null,
      fechaSeparacion: body.fechaSeparacion
        ? new Date(body.fechaSeparacion)
        : new Date(),
      diasTiempo: body.diasTiempo ?? null,
      fechaLimiteManual: body.fechaLimiteManual
        ? new Date(body.fechaLimiteManual)
        : null,
      baucherSeparacion: body.baucherSeparacion || null,
      estado: body.estado ?? "SEPARADO",
    };
    const [row] = await ctx.db
      .insert(ctx.schema.separations)
      .values(values)
      .onConflictDoUpdate({
        target: ctx.schema.separations.departamentoId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo guardar la separación" }, { status: 500 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/separaciones?departamentoId= */
export async function DELETE(req: Request) {
  try {
    const ctx = await dbAndSchema(Permission.DEPARTMENT_UPDATE, req);
    if ("error" in ctx) return ctx.error;
    const departamentoId = new URL(req.url).searchParams.get("departamentoId");
    if (!departamentoId) {
      return NextResponse.json({ error: "Falta departamentoId" }, { status: 400 });
    }
    const [row] = await ctx.db
      .delete(ctx.schema.separations)
      .where(eq(ctx.schema.separations.departamentoId, departamentoId))
      .returning({ id: ctx.schema.separations.id });
    if (!row) {
      return NextResponse.json({ error: "Separación no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
