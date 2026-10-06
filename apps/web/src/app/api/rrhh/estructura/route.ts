import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type EntityType = "organization" | "site" | "department" | "team" | "position";
type Body = { tipo?: EntityType; nombre?: string; organizationId?: string; departmentId?: string; direccion?: string; ruc?: string };

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const [organizations, sites, departments, teams, positions, employees] = await Promise.all([
      db.select().from(schema.hrOrganizations).where(eq(schema.hrOrganizations.activa, true)).orderBy(asc(schema.hrOrganizations.nombre)),
      db.select().from(schema.hrSites).where(eq(schema.hrSites.activa, true)).orderBy(asc(schema.hrSites.nombre)),
      db.select().from(schema.hrDepartments).where(eq(schema.hrDepartments.activa, true)).orderBy(asc(schema.hrDepartments.nombre)),
      db.select().from(schema.hrTeams).where(eq(schema.hrTeams.activa, true)).orderBy(asc(schema.hrTeams.nombre)),
      db.select().from(schema.hrPositions).where(eq(schema.hrPositions.activa, true)).orderBy(asc(schema.hrPositions.nombre)),
      db.select({ id: schema.hrEmployees.id, nombres: schema.hrEmployees.nombres, apellidos: schema.hrEmployees.apellidos, estado: schema.hrEmployees.estado })
        .from(schema.hrEmployees).where(and(isNull(schema.hrEmployees.deletedAt), eq(schema.hrEmployees.estado, "ACTIVO")))
        .orderBy(asc(schema.hrEmployees.apellidos), asc(schema.hrEmployees.nombres)),
    ]);
    return NextResponse.json({ organizations, sites, departments, teams, positions, managers: employees });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_UPDATE);
    if (denied) return denied;

    const body = (await req.json()) as Body;
    const nombre = body.nombre?.trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const { db, schema } = dbModule;
    let row: unknown;

    // Área y cargo se crean desde el panel sin selector de organización: la
    // tabla exige organizationId, así que se toma la primera activa.
    const organizationId =
      body.organizationId ??
      (await db
        .select({ id: schema.hrOrganizations.id })
        .from(schema.hrOrganizations)
        .where(eq(schema.hrOrganizations.activa, true))
        .orderBy(asc(schema.hrOrganizations.nombre))
        .limit(1)
        .then((rows) => rows[0]?.id));

    switch (body.tipo) {
      case "organization": {
        const [created] = await db.insert(schema.hrOrganizations).values({ nombre, ruc: body.ruc?.trim() ?? "" }).returning();
        row = created;
        break;
      }
      case "site": {
        if (!organizationId) return NextResponse.json({ error: "Selecciona una organización" }, { status: 400 });
        const [created] = await db.insert(schema.hrSites).values({ organizationId, nombre, direccion: body.direccion?.trim() ?? "" }).returning();
        row = created;
        break;
      }
      case "department": {
        if (!organizationId) return NextResponse.json({ error: "No hay una organización registrada en el sistema" }, { status: 400 });
        const [created] = await db.insert(schema.hrDepartments).values({ organizationId, nombre }).returning();
        row = created;
        break;
      }
      case "team": {
        if (!body.departmentId) return NextResponse.json({ error: "Selecciona un área" }, { status: 400 });
        const [created] = await db.insert(schema.hrTeams).values({ departmentId: body.departmentId, nombre }).returning();
        row = created;
        break;
      }
      case "position": {
        if (!organizationId) return NextResponse.json({ error: "No hay una organización registrada en el sistema" }, { status: 400 });
        const [created] = await db.insert(schema.hrPositions).values({ organizationId, nombre }).returning();
        row = created;
        break;
      }
      default:
        return NextResponse.json({ error: "Tipo de estructura inválido" }, { status: 400 });
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message.includes("unique") ? "Ya existe un registro con ese nombre" : message }, { status: 500 });
  }
}
