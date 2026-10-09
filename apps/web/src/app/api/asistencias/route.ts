import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  nombre?: unknown;
  dni?: unknown;
  accion?: unknown;
};

const ACCIONES = ["ENTRADA", "REFRIGERIO_INICIO", "REFRIGERIO_FIN", "SALIDA"] as const;
type Accion = (typeof ACCIONES)[number];

/** Lima no aplica horario de verano: siempre UTC-5. */
function inicioDiaLima(): Date {
  const lima = new Date(Date.now() - 5 * 3600 * 1000);
  const dia = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate());
  return new Date(dia + 5 * 3600 * 1000);
}

type RegistroRow = {
  id: string;
  nombre: string;
  dni: string;
  entradaAt: Date | null;
  refrigerioInicioAt: Date | null;
  refrigerioFinAt: Date | null;
  salidaAt: Date | null;
  asistio: boolean;
  createdAt: Date;
};

function toView(row: RegistroRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    dni: row.dni,
    entradaAt: row.entradaAt?.toISOString?.() ?? null,
    refrigerioInicioAt: row.refrigerioInicioAt?.toISOString?.() ?? null,
    refrigerioFinAt: row.refrigerioFinAt?.toISOString?.() ?? null,
    salidaAt: row.salidaAt?.toISOString?.() ?? null,
    asistio: row.asistio,
    createdAt: row.createdAt?.toISOString?.() ?? null,
  };
}

/** GET /api/asistencias — todos los registros (mas recientes primero). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.ATTENDANCE_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const rows = await db
      .select()
      .from(schema.attendance)
      .orderBy(desc(schema.attendance.createdAt))
      .limit(500);
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/asistencias — marca la jornada.
 * Body: { nombre, dni, accion } con accion ENTRADA | REFRIGERIO_INICIO |
 * REFRIGERIO_FIN | SALIDA. La hora siempre la estampa el servidor.
 */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.ATTENDANCE_CREATE);
    if (denied) return denied;

    const body = (await req.json()) as Body;
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const dni = typeof body.dni === "string" ? body.dni.trim() : "";
    const accion = body.accion as Accion;

    if (!nombre) {
      return NextResponse.json({ error: "Indicá el nombre del trabajador" }, { status: 400 });
    }
    if (!dni) {
      return NextResponse.json({ error: "Indicá el DNI del trabajador" }, { status: 400 });
    }
    if (dni.length > 30) {
      return NextResponse.json({ error: "El DNI supera el largo permitido" }, { status: 400 });
    }
    if (!ACCIONES.includes(accion)) {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    const { db, schema } = dbModule;
    const [hoy] = await db
      .select()
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.dni, dni),
          gte(schema.attendance.createdAt, inicioDiaLima())
        )
      )
      .orderBy(desc(schema.attendance.createdAt))
      .limit(1);

    const now = new Date();

    if (accion === "ENTRADA") {
      if (hoy) {
        return NextResponse.json(
          { error: "Ya registraste tu entrada de hoy" },
          { status: 400 }
        );
      }
      const [row] = await db
        .insert(schema.attendance)
        .values({
          nombre,
          dni,
          entradaAt: now,
          asistio: true,
        })
        .returning();
      if (!row) {
        return NextResponse.json({ error: "No se pudo registrar la entrada" }, { status: 500 });
      }
      return NextResponse.json({ registro: toView(row) }, { status: 201 });
    }

    if (!hoy) {
      return NextResponse.json(
        { error: "Primero registrá la entrada de hoy" },
        { status: 400 }
      );
    }

    const patch: Partial<typeof schema.attendance.$inferInsert> = { updatedAt: now };

    if (accion === "REFRIGERIO_INICIO") {
      if (hoy.salidaAt) {
        return NextResponse.json(
          { error: "La jornada ya finalizó, no se puede iniciar el refrigerio" },
          { status: 400 }
        );
      }
      if (hoy.refrigerioInicioAt) {
        return NextResponse.json(
          { error: "Ya iniciaste el refrigerio de hoy" },
          { status: 400 }
        );
      }
      patch.refrigerioInicioAt = now;
    } else if (accion === "REFRIGERIO_FIN") {
      if (!hoy.refrigerioInicioAt) {
        return NextResponse.json(
          { error: "Primero iniciá el refrigerio" },
          { status: 400 }
        );
      }
      if (hoy.refrigerioFinAt) {
        return NextResponse.json(
          { error: "Ya finalizaste el refrigerio de hoy" },
          { status: 400 }
        );
      }
      patch.refrigerioFinAt = now;
    } else {
      if (hoy.salidaAt) {
        return NextResponse.json(
          { error: "Ya registraste la salida de hoy" },
          { status: 400 }
        );
      }
      patch.salidaAt = now;
    }

    const [row] = await db
      .update(schema.attendance)
      .set(patch)
      .where(eq(schema.attendance.id, hoy.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo actualizar la jornada" }, { status: 500 });
    }

    let aviso: string | null = null;
    if (accion === "REFRIGERIO_FIN" && hoy.refrigerioInicioAt) {
      const minutos = Math.round((now.getTime() - hoy.refrigerioInicioAt.getTime()) / 60000);
      if (minutos > 60) {
        aviso = `El refrigerio duró ${minutos} minutos; lo máximo permitido es 60.`;
      }
    }

    return NextResponse.json({ registro: toView(row), aviso });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
