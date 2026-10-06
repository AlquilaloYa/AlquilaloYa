import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const TASK_STATES = ["PENDIENTE", "EN_RESOLUCION", "RESUELTA"] as const;
type TaskState = (typeof TASK_STATES)[number];

type Body = {
  id?: string;
  titulo?: string;
  descripcion?: string;
  asignadoA?: string;
  empleadoId?: string | null;
  fechaLimite?: string;
  estado?: string;
};

function isState(value: unknown): value is TaskState {
  return TASK_STATES.includes(value as TaskState);
}

function toView(r: {
  id: string;
  titulo: string;
  descripcion: string;
  asignadoA: string;
  empleadoId: string | null;
  fechaLimite: Date;
  estado: string;
  creadoPor: string;
  origenTipo: string;
  origenEvento: string | null;
  origenContratoId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    asignadoA: r.asignadoA,
    empleadoId: r.empleadoId,
    fechaLimite: r.fechaLimite?.toISOString?.() ?? null,
    estado: r.estado,
    creadoPor: r.creadoPor,
    origenTipo: r.origenTipo,
    origenEvento: r.origenEvento,
    origenContratoId: r.origenContratoId,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
    completedAt: r.completedAt?.toISOString?.() ?? null,
  };
}

/** GET /api/tareas — listado de tareas (mas recientes primero). */
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
      .from(schema.tasks)
      .orderBy(desc(schema.tasks.fechaLimite));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/tareas — crea una tarea. */
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
    if (!body.titulo?.trim()) {
      return NextResponse.json({ error: "Indica el titulo de la tarea" }, { status: 400 });
    }
    if (!body.fechaLimite) {
      return NextResponse.json({ error: "Indica la fecha limite" }, { status: 400 });
    }
    let empleadoId: string | null = null;
    let asignadoA = (body.asignadoA ?? "").trim();
    if (body.empleadoId) {
      const [empleado] = await db
        .select({ id: schema.hrEmployees.id, nombres: schema.hrEmployees.nombres, apellidos: schema.hrEmployees.apellidos, estado: schema.hrEmployees.estado })
        .from(schema.hrEmployees)
        .where(and(eq(schema.hrEmployees.id, body.empleadoId), isNull(schema.hrEmployees.deletedAt)))
        .limit(1);
      if (!empleado || empleado.estado !== "ACTIVO") {
        return NextResponse.json({ error: "Solo se pueden asignar tareas a personal activo" }, { status: 400 });
      }
      empleadoId = empleado.id;
      asignadoA = `${empleado.nombres} ${empleado.apellidos}`.trim();
    }
    const estado = isState(body.estado) ? body.estado : "PENDIENTE";
    const [row] = await db
      .insert(schema.tasks)
      .values({
        titulo: body.titulo.trim(),
        descripcion: (body.descripcion ?? "").trim(),
        asignadoA,
        empleadoId,
        fechaLimite: new Date(body.fechaLimite),
        estado,
        creadoPor: auth.user.name || auth.user.email,
        completedAt: estado === "RESUELTA" ? new Date() : null,
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear la tarea" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/tareas — actualiza por id (estado, asignado, fecha, etc). */
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
      .select({ id: schema.tasks.id, estado: schema.tasks.estado, empleadoId: schema.tasks.empleadoId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, body.id));
    if (!existing) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }
    const patch: {
      titulo?: string;
      descripcion?: string;
      asignadoA?: string;
      fechaLimite?: Date;
      estado?: string;
      empleadoId?: string | null;
      completedAt?: Date | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    if (body.titulo !== undefined) {
      if (!body.titulo.trim()) {
        return NextResponse.json({ error: "Indica el titulo de la tarea" }, { status: 400 });
      }
      patch.titulo = body.titulo.trim();
    }
    if (body.descripcion !== undefined) patch.descripcion = body.descripcion.trim();
    if (body.empleadoId !== undefined) {
      if ((body.empleadoId || null) === existing.empleadoId) {
        // Mantener la asignación histórica; solo una asignación nueva se valida contra estado ACTIVO.
      } else if (body.empleadoId === null || body.empleadoId === "") {
        patch.empleadoId = null;
        if (body.asignadoA !== undefined) patch.asignadoA = body.asignadoA.trim();
      } else {
        const [empleado] = await db
          .select({ id: schema.hrEmployees.id, nombres: schema.hrEmployees.nombres, apellidos: schema.hrEmployees.apellidos, estado: schema.hrEmployees.estado })
          .from(schema.hrEmployees)
          .where(and(eq(schema.hrEmployees.id, body.empleadoId), isNull(schema.hrEmployees.deletedAt)))
          .limit(1);
        if (!empleado || empleado.estado !== "ACTIVO") {
          return NextResponse.json({ error: "Solo se pueden asignar tareas a personal activo" }, { status: 400 });
        }
        patch.empleadoId = empleado.id;
        patch.asignadoA = `${empleado.nombres} ${empleado.apellidos}`.trim();
      }
    } else if (body.asignadoA !== undefined) {
      patch.asignadoA = body.asignadoA.trim();
      patch.empleadoId = null;
    }
    if (body.fechaLimite) patch.fechaLimite = new Date(body.fechaLimite);
    if (body.estado !== undefined && isState(body.estado)) {
      patch.estado = body.estado;
      if (body.estado === "RESUELTA" && existing.estado !== "RESUELTA") {
        patch.completedAt = new Date();
      } else if (body.estado !== "RESUELTA") {
        patch.completedAt = null;
      }
    }
    const [row] = await db
      .update(schema.tasks)
      .set(patch)
      .where(eq(schema.tasks.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/tareas?id= — elimina una tarea. */
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
      .delete(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });
    if (!row) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}