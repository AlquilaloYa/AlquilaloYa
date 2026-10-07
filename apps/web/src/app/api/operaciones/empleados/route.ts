import { NextResponse } from "next/server";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_READ,
    );
    if (denied) return denied;

    const { db, schema } = dbModule;
    const employees = await db
      .select({
        id: schema.hrEmployees.id,
        nombres: schema.hrEmployees.nombres,
        apellidos: schema.hrEmployees.apellidos,
        cargo: schema.hrEmployees.cargo,
        area: schema.hrEmployees.area,
        equipo: schema.hrEmployees.equipo,
      })
      .from(schema.hrEmployees)
      .where(
        and(
          eq(schema.hrEmployees.estado, "ACTIVO"),
          isNull(schema.hrEmployees.deletedAt),
          or(
            ilike(schema.hrEmployees.area, "%manten%"),
            ilike(schema.hrEmployees.cargo, "%manten%"),
            ilike(schema.hrEmployees.equipo, "%manten%"),
          ),
        ),
      )
      .orderBy(
        asc(schema.hrEmployees.apellidos),
        asc(schema.hrEmployees.nombres),
      );

    return NextResponse.json(employees);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el equipo",
      },
      { status: 500 },
    );
  }
}
