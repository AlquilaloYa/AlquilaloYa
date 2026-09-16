import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { INVENTARIO_MUEBLERIA } from "@/lib/catalogos";

export const dynamic = "force-dynamic";

/** GET /api/inventarios — { porDepartamento: {depto: items[]}, catalogo: grupos }. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const rows = await db.select().from(schema.departmentInventories);
    const porDepartamento: Record<string, string[]> = {};
    for (const r of rows) {
      porDepartamento[r.departamentoId] = Array.isArray(r.items) ? (r.items as string[]) : [];
    }
    const catalogoRows = await db.select().from(schema.inventarioCatalogo);
    const extraPorCategoria = new Map<string, [string, string][]>();
    for (const c of catalogoRows) {
      const lista = extraPorCategoria.get(c.categoria) ?? [];
      lista.push([c.id, c.etiqueta]);
      extraPorCategoria.set(c.categoria, lista);
    }
    const catalogo = INVENTARIO_MUEBLERIA.map((grupo) => ({
      ...grupo,
      items: [...grupo.items, ...(extraPorCategoria.get(grupo.categoria) ?? [])],
    }));
    return NextResponse.json({ porDepartamento, catalogo });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/inventarios/catalogo — { categoria, etiqueta } → añade elemento al catálogo. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as { categoria?: string; etiqueta?: string };
    const categoria = body.categoria?.trim();
    const etiqueta = body.etiqueta?.trim();
    if (!categoria || !etiqueta) {
      return NextResponse.json({ error: "Faltan categoria y/o etiqueta" }, { status: 400 });
    }
    const valida = INVENTARIO_MUEBLERIA.some((g) => g.categoria.toLowerCase() === categoria.toLowerCase());
    if (!valida) {
      return NextResponse.json(
        { error: `Categoría inválida: debe ser una de ${INVENTARIO_MUEBLERIA.map((g) => g.categoria).join(", ")}` },
        { status: 400 }
      );
    }
    const [fila] = await db
      .insert(schema.inventarioCatalogo)
      .values({ categoria, etiqueta })
      .onConflictDoNothing()
      .returning();
    if (fila) {
      return NextResponse.json({ ok: true, id: fila.id, etiqueta: fila.etiqueta });
    }
    const exist = await db.select().from(schema.inventarioCatalogo);
    const match = exist.find(
      (c) => c.categoria.toLowerCase() === categoria.toLowerCase() && c.etiqueta === etiqueta
    );
    return NextResponse.json({ ok: true, id: match?.id, etiqueta: match?.etiqueta ?? etiqueta });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/inventarios — { departamentoId, items } (upsert). */
export async function PUT(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as { departamentoId?: string; items?: string[] };
    if (!body.departamentoId) {
      return NextResponse.json({ error: "Falta departamentoId" }, { status: 400 });
    }
    const items = Array.isArray(body.items)
      ? body.items.filter((i) => typeof i === "string")
      : [];
    await db
      .insert(schema.departmentInventories)
      .values({ departamentoId: body.departamentoId, items })
      .onConflictDoUpdate({
        target: schema.departmentInventories.departamentoId,
        set: { items, updatedAt: new Date() },
      });
    return NextResponse.json({ ok: true, departamentoId: body.departamentoId, items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
