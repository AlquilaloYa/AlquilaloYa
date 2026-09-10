import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const ESTADOS_RH = ["ACTIVO", "INACTIVO", "LICENCIA"] as const;
type EstadoRh = (typeof ESTADOS_RH)[number];

type Doc = { nombre?: string; tipo?: string; url?: string };

type Body = {
  id?: string;
  nombres?: string;
  apellidos?: string;
  dni?: string;
  email?: string;
  telefono?: string;
  cargo?: string;
  area?: string;
  fechaIngreso?: string;
  estado?: string;
  direccion?: string;
  notas?: string;
  documentos?: unknown;
};

function isEstado(value: unknown): value is EstadoRh {
  return ESTADOS_RH.includes(value as EstadoRh);
}

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

function toView(r: {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  telefono: string;
  cargo: string;
  area: string;
  fechaIngreso: Date | null;
  estado: string;
  direccion: string;
  notas: string;
  documentos: unknown;
  creadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    nombres: r.nombres,
    apellidos: r.apellidos,
    dni: r.dni,
    email: r.email,
    telefono: r.telefono,
    cargo: r.cargo,
    area: r.area,
    fechaIngreso: r.fechaIngreso?.toISOString?.() ?? null,
    estado: r.estado,
    direccion: r.direccion,
    notas: r.notas,
    documentos: toDocs(r.documentos),
    creadoPor: r.creadoPor,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

/** GET /api/rrhh — listado de expedientes. */
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
      .from(schema.hrEmployees)
      .orderBy(asc(schema.hrEmployees.apellidos), asc(schema.hrEmployees.nombres));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/rrhh — crea un expediente. */
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
    if (!body.nombres?.trim()) {
      return NextResponse.json({ error: "Indica los nombres del colaborador" }, { status: 400 });
    }
    const [row] = await db
      .insert(schema.hrEmployees)
      .values({
        nombres: body.nombres.trim(),
        apellidos: (body.apellidos ?? "").trim(),
        dni: (body.dni ?? "").trim(),
        email: (body.email ?? "").trim(),
        telefono: (body.telefono ?? "").trim(),
        cargo: (body.cargo ?? "").trim(),
        area: (body.area ?? "").trim(),
        fechaIngreso: body.fechaIngreso ? new Date(body.fechaIngreso) : null,
        estado: isEstado(body.estado) ? body.estado : "ACTIVO",
        direccion: (body.direccion ?? "").trim(),
        notas: (body.notas ?? "").trim(),
        documentos: toDocs(body.documentos),
        creadoPor: auth.user.name || auth.user.email,
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear el expediente" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/rrhh — actualiza un expediente por id. */
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
    const [existing] = await db
      .select({ id: schema.hrEmployees.id })
      .from(schema.hrEmployees)
      .where(eq(schema.hrEmployees.id, body.id));
    if (!existing) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    const patch: {
      nombres?: string;
      apellidos?: string;
      dni?: string;
      email?: string;
      telefono?: string;
      cargo?: string;
      area?: string;
      fechaIngreso?: Date | null;
      estado?: string;
      direccion?: string;
      notas?: string;
      documentos?: Doc[];
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (body.nombres !== undefined) {
      if (!body.nombres.trim()) {
        return NextResponse.json({ error: "Indica los nombres del colaborador" }, { status: 400 });
      }
      patch.nombres = body.nombres.trim();
    }
    if (body.apellidos !== undefined) patch.apellidos = body.apellidos.trim();
    if (body.dni !== undefined) patch.dni = body.dni.trim();
    if (body.email !== undefined) patch.email = body.email.trim();
    if (body.telefono !== undefined) patch.telefono = body.telefono.trim();
    if (body.cargo !== undefined) patch.cargo = body.cargo.trim();
    if (body.area !== undefined) patch.area = body.area.trim();
    if (body.fechaIngreso !== undefined) {
      patch.fechaIngreso = body.fechaIngreso ? new Date(body.fechaIngreso) : null;
    }
    if (body.estado !== undefined && isEstado(body.estado)) patch.estado = body.estado;
    if (body.direccion !== undefined) patch.direccion = body.direccion.trim();
    if (body.notas !== undefined) patch.notas = body.notas.trim();
    if (body.documentos !== undefined) patch.documentos = toDocs(body.documentos);
    const [row] = await db
      .update(schema.hrEmployees)
      .set(patch)
      .where(eq(schema.hrEmployees.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/rrhh?id= — elimina un expediente. */
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
      .delete(schema.hrEmployees)
      .where(eq(schema.hrEmployees.id, id))
      .returning({ id: schema.hrEmployees.id });
    if (!row) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}