import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function siteFromDepartment(code: string): "Angamos" | "Benavides" | null {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode.startsWith("ANG170")) return "Angamos";
  if (normalizedCode.startsWith("BEN2195")) return "Benavides";
  return null;
}

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
    const [departments, clients] = await Promise.all([
      db
        .select({
          id: schema.departments.id,
          code: schema.departments.codigo,
          name: schema.departments.nombre,
          number: schema.departments.numero,
          active: schema.departments.activo,
        })
        .from(schema.departments)
        .orderBy(asc(schema.departments.codigo)),
      db
        .select({
          id: schema.clients.id,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
          codigoDepartamento: schema.clients.codigoDepartamento,
        })
        .from(schema.clients)
        .where(and(eq(schema.clients.activo, true), isNull(schema.clients.eliminadoEn)))
        .orderBy(asc(schema.clients.nombres), asc(schema.clients.apellidos)),
    ]);

    return NextResponse.json({
      departments: departments.flatMap((department) => {
        const site = siteFromDepartment(department.code);
        return site
          ? [
              {
                ...department,
                site,
                label: `${department.code} · ${department.name} ${department.number}`,
              },
            ]
          : [];
      }),
      clients: clients.map((client) => ({
        ...client,
        name: [client.nombres, client.apellidos].filter(Boolean).join(" "),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar clientes y departamentos",
      },
      { status: 500 },
    );
  }
}
