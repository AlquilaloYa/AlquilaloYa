import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export type InspectionItem = {
  questionId?: string;
  categoria?: string;
  texto: string;
  resultado: "OK" | "NEGATIVO" | "";
  motivo?: string;
  tareaId?: string;
  tareaAsignado?: string;
};

type Body = {
  id?: string;
  nombre?: string;
  numero?: string;
  contactoId?: string | null;
  contactoNombre?: string;
  personaInspecciona?: string;
  departamentoId?: string | null;
  departamentoNombre?: string;
  asignadoA?: string;
  fecha?: string;
  estado?: string;
  items?: InspectionItem[];
};

function toItemArray(value: unknown): InspectionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => {
      const item: InspectionItem = {
        texto: typeof x.texto === "string" ? x.texto : "",
        resultado:
          x.resultado === "OK" || x.resultado === "NEGATIVO" ? x.resultado : "",
        motivo: typeof x.motivo === "string" ? x.motivo : "",
      };
      if (typeof x.questionId === "string") item.questionId = x.questionId;
      if (typeof x.categoria === "string") item.categoria = x.categoria;
      return item;
    });
}

function toView(r: {
  id: string;
  nombre: string;
  numero: string;
  contactoId: string | null;
  contactoNombre: string;
  personaInspecciona: string;
  inspectorId: string;
  inspectorNombre: string;
  departamentoId: string | null;
  departamentoNombre: string;
  asignadoA: string;
  fecha: Date;
  estado: string;
  items: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    numero: r.numero,
    contactoId: r.contactoId,
    contactoNombre: r.contactoNombre,
    personaInspecciona: r.personaInspecciona,
    inspectorId: r.inspectorId,
    inspectorNombre: r.inspectorNombre,
    departamentoId: r.departamentoId,
    departamentoNombre: r.departamentoNombre,
    asignadoA: r.asignadoA,
    fecha: r.fecha?.toISOString?.() ?? null,
    estado: r.estado,
    items: toItemArray(r.items),
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
    completedAt: r.completedAt?.toISOString?.() ?? null,
  };
}

/** GET /api/inspecciones — listado (mas nuevas primero). */
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
      .from(schema.inspections)
      .orderBy(desc(schema.inspections.fecha));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/inspecciones — crea una inspeccion. El inspector es el usuario logueado. */
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
    if (!body.personaInspecciona?.trim()) {
      return NextResponse.json({ error: "Indica la persona que inspecciona" }, { status: 400 });
    }
    if (!body.departamentoNombre?.trim()) {
      return NextResponse.json({ error: "Selecciona el departamento" }, { status: 400 });
    }
    const items = toItemArray(body.items);
    if (items.some((i) => i.resultado === "NEGATIVO" && !i.motivo?.trim())) {
      return NextResponse.json(
        { error: "Cada revision negativa necesita su descripcion del problema" },
        { status: 400 }
      );
    }
    const estado = body.estado === "COMPLETADO" ? "COMPLETADO" : "BORRADOR";
    const [row] = await db
      .insert(schema.inspections)
      .values({
        nombre: (body.nombre ?? "").trim() || body.departamentoNombre.trim(),
        numero: (body.numero ?? "").trim(),
        contactoId: body.contactoId || null,
        contactoNombre: (body.contactoNombre ?? "").trim(),
        personaInspecciona: body.personaInspecciona.trim(),
        inspectorId: auth.user.email,
        inspectorNombre: auth.user.name || auth.user.email,
        departamentoId: body.departamentoId || null,
        departamentoNombre: body.departamentoNombre.trim(),
        asignadoA: (body.asignadoA ?? "").trim(),
        fecha: body.fecha ? new Date(body.fecha) : new Date(),
        estado,
        items,
        completedAt: estado === "COMPLETADO" ? new Date() : null,
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear la inspección" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/inspecciones — actualiza por id (reediciones revalidan el PDF). */
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
    const items = toItemArray(body.items);
    if (items.some((i) => i.resultado === "NEGATIVO" && !i.motivo?.trim())) {
      return NextResponse.json(
        { error: "Cada revision negativa necesita su descripcion del problema" },
        { status: 400 }
      );
    }
    const estado =
      body.estado === "COMPLETADO" ? "COMPLETADO" : body.estado === "BORRADOR" ? "BORRADOR" : undefined;
    const [existing] = await db
      .select({ id: schema.inspections.id, estado: schema.inspections.estado })
      .from(schema.inspections)
      .where(eq(schema.inspections.id, body.id));
    if (!existing) {
      return NextResponse.json({ error: "Inspeccion no encontrada" }, { status: 404 });
    }
    const patch: {
      nombre?: string;
      numero?: string;
      contactoId?: string | null;
      contactoNombre?: string;
      personaInspecciona?: string;
      departamentoId?: string | null;
      departamentoNombre?: string;
      asignadoA?: string;
      fecha?: Date;
      estado?: string;
      items: InspectionItem[];
      completedAt?: Date;
      updatedAt: Date;
    } = {
      items,
      updatedAt: new Date(),
    };
    if (body.nombre !== undefined) patch.nombre = body.nombre.trim();
    if (body.numero !== undefined) patch.numero = body.numero.trim();
    if (body.contactoId !== undefined) patch.contactoId = body.contactoId || null;
    if (body.contactoNombre !== undefined) patch.contactoNombre = body.contactoNombre.trim();
    if (body.personaInspecciona !== undefined) patch.personaInspecciona = body.personaInspecciona.trim();
    if (body.departamentoId !== undefined) patch.departamentoId = body.departamentoId || null;
    if (body.departamentoNombre !== undefined)
      patch.departamentoNombre = body.departamentoNombre.trim();
    if (body.asignadoA !== undefined) patch.asignadoA = body.asignadoA.trim();
    if (body.fecha) patch.fecha = new Date(body.fecha);
    if (estado) patch.estado = estado;
    if (estado === "COMPLETADO" && existing.estado !== "COMPLETADO") patch.completedAt = new Date();
    const [row] = await db
      .update(schema.inspections)
      .set(patch)
      .where(eq(schema.inspections.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Inspección no encontrada" }, { status: 404 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/inspecciones?id= — elimina una inspeccion. */
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
      .delete(schema.inspections)
      .where(eq(schema.inspections.id, id))
      .returning({ id: schema.inspections.id });
    if (!row) {
      return NextResponse.json({ error: "Inspeccion no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
