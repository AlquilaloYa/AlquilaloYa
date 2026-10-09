import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Doc = { nombre?: string; tipo?: string; url?: string };

function toDocs(value: unknown): Doc[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      nombre: typeof x.nombre === "string" ? x.nombre : "",
      tipo: typeof x.tipo === "string" ? x.tipo : "",
      url: typeof x.url === "string" ? x.url : "",
    }));
}

/** GET /api/rrhh/:id — expediente individual. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const [row] = await db
      .select()
      .from(schema.hrEmployees)
      .where(and(eq(schema.hrEmployees.id, params.id), isNull(schema.hrEmployees.deletedAt)))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      nombres: row.nombres,
      apellidos: row.apellidos,
      dni: row.dni,
      email: row.email,
      telefono: row.telefono,
      cargo: row.cargo,
      area: row.area,
      sede: row.sede,
      equipo: row.equipo,
      responsable: row.responsable,
      organizationId: row.organizationId,
      siteId: row.siteId,
      departmentId: row.departmentId,
      teamId: row.teamId,
      positionId: row.positionId,
      managerId: row.managerId,
      fechaIngreso: row.fechaIngreso?.toISOString() ?? null,
      fechaNacimiento: row.fechaNacimiento?.toISOString() ?? null,
      nacionalidad: row.nacionalidad,
      codigoEmpleado: row.codigoEmpleado,
      fechaBaja: row.fechaBaja?.toISOString() ?? null,
      estado: row.estado,
      onboardingStage: row.onboardingStage,
      direccion: row.direccion,
      notas: row.notas,
      documentos: toDocs(row.documentos),
      creadoPor: row.creadoPor,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
