import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["CONVIVENCIA", "PAGO", "DANOS", "OTRO"]);
const SEVERIDADES = new Set(["LEVE", "MEDIA", "GRAVE"]);

/** GET /api/scoring/incidents?clienteId= — incidencias activas. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.SCORING_READ);
    if (denied) return denied;

    const clienteId = new URL(req.url).searchParams.get("clienteId") ?? undefined;
    const repo = new dbModule.DrizzleScoringRepository();
    const items = await repo.listIncidents(clienteId || undefined);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/scoring/incidents — registra una incidencia que afecta el scoring. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.SCORING_MANAGE);
    if (denied) return denied;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }

    const clienteId = typeof body.clienteId === "string" ? body.clienteId.trim() : "";
    if (!clienteId) {
      return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
    }

    const tipoRaw = typeof body.tipo === "string" ? body.tipo : "CONVIVENCIA";
    const tipo = TIPOS.has(tipoRaw) ? tipoRaw : "CONVIVENCIA";

    const severidadRaw = typeof body.severidad === "string" ? body.severidad : "MEDIA";
    const severidad = SEVERIDADES.has(severidadRaw) ? severidadRaw : "MEDIA";

    const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
    if (descripcion.length < 3) {
      return NextResponse.json(
        { error: "Describe brevemente el reporte del cliente" },
        { status: 400 },
      );
    }
    if (descripcion.length > 2000) {
      return NextResponse.json(
        { error: "La descripción es demasiado larga" },
        { status: 400 },
      );
    }

    const repo = new dbModule.DrizzleScoringRepository();
    const incident = await repo.createIncident({
      clienteId,
      tipo,
      severidad,
      descripcion,
      creadoPor: auth.user.name || auth.user.email,
    });
    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
