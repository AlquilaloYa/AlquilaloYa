import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Directorio mínimo para asignaciones: nunca expone DNI, dirección ni documentos. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_DIRECTORY_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const rows = await db
      .select({
        id: schema.hrEmployees.id,
        nombres: schema.hrEmployees.nombres,
        apellidos: schema.hrEmployees.apellidos,
        cargo: schema.hrEmployees.cargo,
        email: schema.hrEmployees.email,
        estado: schema.hrEmployees.estado,
      })
      .from(schema.hrEmployees)
      .where(and(eq(schema.hrEmployees.estado, "ACTIVO"), isNull(schema.hrEmployees.deletedAt)))
      .orderBy(asc(schema.hrEmployees.apellidos), asc(schema.hrEmployees.nombres));

    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}