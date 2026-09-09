import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const rows = await db
      .select()
      .from(schema.clients)
      .orderBy(schema.clients.nombres);

    return NextResponse.json(
      rows.map((c) => ({
        id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        documentoIdentidad: c.documentoIdentidad,
        ruc: c.ruc,
        tipoPersona: c.tipoPersona,
        email: c.email,
        telefono: c.telefono,
        codigoDepartamento: c.codigoDepartamento,
        domicilio: c.domicilio,
        activo: c.activo,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { id, ...patch } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const values: Record<string, unknown> = {};
    if ("codigoDepartamento" in patch) {
      values.codigoDepartamento = patch.codigoDepartamento ?? null;
    }
    if ("nombres" in patch) values.nombres = patch.nombres;
    if ("apellidos" in patch) values.apellidos = patch.apellidos ?? null;
    if ("email" in patch) values.email = patch.email ?? null;
    if ("telefono" in patch) values.telefono = patch.telefono ?? null;
    if ("domicilio" in patch) values.domicilio = patch.domicilio ?? null;
    if ("activo" in patch) values.activo = patch.activo;

    const row = await db
      .update(schema.clients)
      .set(values)
      .where(sql`id = ${id}`)
      .returning();

    return NextResponse.json(row[0]);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const body = await req.json();
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const row = await db
      .insert(schema.clients)
      .values({
        nombres: body.nombres,
        apellidos: body.apellidos ?? null,
        documentoIdentidad: body.documentoIdentidad,
        ruc: body.ruc ?? null,
        tipoPersona: body.tipoPersona,
        email: body.email ?? null,
        telefono: body.telefono ?? null,
        codigoDepartamento: body.codigoDepartamento ?? null,
        domicilio: body.domicilio ?? null,
        activo: body.activo !== false,
      })
      .returning();

    return NextResponse.json(row[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}