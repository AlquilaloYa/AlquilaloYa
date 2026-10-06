import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  tipoContrato?: string;
  numeroContrato?: string;
  fechaInicio?: string;
  fechaFin?: string | null;
  salario?: string;
  renovacionDeId?: string | null;
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_READ);
    if (denied) return denied;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const rows = await db.select().from(schema.hrEmployments)
      .where(eq(schema.hrEmployments.employeeId, params.id))
      .orderBy(desc(schema.hrEmployments.fechaInicio));
    return NextResponse.json(rows.map((row) => ({ ...row, fechaInicio: row.fechaInicio.toISOString(), fechaFin: row.fechaFin?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Nuevos periodos y renovaciones son filas nuevas; el contrato anterior se conserva. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_UPDATE);
    if (denied) return denied;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const body = (await req.json()) as Body;
    if (!body.fechaInicio) return NextResponse.json({ error: "La fecha de inicio es obligatoria" }, { status: 400 });
    if (body.fechaFin && body.fechaFin < body.fechaInicio) return NextResponse.json({ error: "La fecha de término debe ser posterior al inicio" }, { status: 400 });
    const [employee] = await db.select({ id: schema.hrEmployees.id, deletedAt: schema.hrEmployees.deletedAt })
      .from(schema.hrEmployees).where(eq(schema.hrEmployees.id, params.id)).limit(1);
    if (!employee || employee.deletedAt) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(schema.hrEmployments)
        .where(and(eq(schema.hrEmployments.employeeId, params.id), eq(schema.hrEmployments.estado, "ACTIVO")))
        .orderBy(desc(schema.hrEmployments.fechaInicio)).limit(1);
      if (current && body.renovacionDeId !== current.id) {
        return { error: "El empleado ya tiene una relación laboral activa; indica cuál estás renovando" } as const;
      }
      if (!current && body.renovacionDeId) return { error: "La relación indicada para renovar no está activa" } as const;
      if (current && body.renovacionDeId) {
        const finAnterior = new Date(new Date(body.fechaInicio!).getTime() - 1);
        await tx.update(schema.hrEmployments).set({ fechaFin: finAnterior, estado: "FINALIZADO" }).where(eq(schema.hrEmployments.id, current.id));
      }
      const [created] = await tx.insert(schema.hrEmployments).values({
        employeeId: params.id,
        tipoContrato: body.tipoContrato?.trim() || "INDEFINIDO",
        numeroContrato: body.numeroContrato?.trim() ?? "",
        fechaInicio: new Date(body.fechaInicio!),
        fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
        salario: body.salario?.trim() ?? "",
        renovacionDeId: body.renovacionDeId || null,
        createdBy: auth.user.name || auth.user.email,
      }).returning();
      if (!created) return { error: "No se pudo crear la relación laboral" } as const;
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: params.id,
        actor: auth.user.name || auth.user.email,
        action: body.renovacionDeId ? "EMPLOYMENT_RENEWED" : "EMPLOYMENT_CREATED",
        before: current ? { employmentId: current.id, fechaFin: current.fechaFin, estado: current.estado } : null,
        after: { employmentId: created.id, tipoContrato: created.tipoContrato, numeroContrato: created.numeroContrato, fechaInicio: created.fechaInicio, fechaFin: created.fechaFin, estado: created.estado },
      });
      return { row: created } as const;
    });
    if ("error" in row) return NextResponse.json({ error: row.error }, { status: 409 });
    return NextResponse.json(row.row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
