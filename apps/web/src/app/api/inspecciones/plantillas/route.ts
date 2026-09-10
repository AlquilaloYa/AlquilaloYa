import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export type TemplateCategoria = {
  nombre: string;
  preguntas: string[];
};

type Body = {
  id?: string;
  nombre?: string;
  categorias?: TemplateCategoria[];
};

function toCategorias(value: unknown): TemplateCategoria[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      nombre: typeof x.nombre === "string" ? x.nombre.trim() : "General",
      preguntas: Array.isArray(x.preguntas)
        ? x.preguntas.filter((p): p is string => typeof p === "string" && p.trim() !== "")
        : [],
    }));
}

function toView(r: {
  id: string;
  nombre: string;
  categorias: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    categorias: toCategorias(r.categorias),
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

/** GET /api/inspecciones/plantillas — listado de plantillas guardadas. */
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
      .from(schema.inspectionTemplates)
      .orderBy(schema.inspectionTemplates.nombre);
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/inspecciones/plantillas — crea una plantilla. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body;
    const nombre = (body.nombre ?? "").trim();
    const categorias = toCategorias(body.categorias).filter((c) => c.preguntas.length > 0);
    if (!nombre) {
      return NextResponse.json({ error: "Poné un nombre a la plantilla" }, { status: 400 });
    }
    if (categorias.length === 0) {
      return NextResponse.json({ error: "La plantilla necesita al menos una pregunta" }, { status: 400 });
    }
    const [row] = await db
      .insert(schema.inspectionTemplates)
      .values({ nombre, categorias })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear la plantilla" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/inspecciones/plantillas — actualiza por id. */
export async function PUT(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body;
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const patch: { nombre?: string; categorias?: TemplateCategoria[]; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.nombre !== undefined) patch.nombre = body.nombre.trim();
    if (body.categorias !== undefined)
      patch.categorias = toCategorias(body.categorias).filter((c) => c.preguntas.length > 0);
    const [row] = await db
      .update(schema.inspectionTemplates)
      .set(patch)
      .where(eq(schema.inspectionTemplates.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/inspecciones/plantillas?id= — elimina una plantilla. */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [row] = await db
      .delete(schema.inspectionTemplates)
      .where(eq(schema.inspectionTemplates.id, id))
      .returning({ id: schema.inspectionTemplates.id });
    if (!row) {
      return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
