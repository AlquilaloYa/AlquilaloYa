import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams) {
  const take = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Number(searchParams.get("offset") ?? 0) || 0;
  const filter: Record<string, string | number> = { limit: take, offset };
  const optional: Record<string, string> = {
    usuario: "usuario",
    accion: "accion",
    entidad: "entidad",
    from: "from",
    to: "to",
  };
  for (const [param, key] of Object.entries(optional)) {
    const v = searchParams.get(param);
    if (v) filter[key] = v;
  }
  return filter;
}

/** GET /api/audit — auditoría append-only, requiere audit.read. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.AUDIT_READ);
    if (denied) return denied;

    const repo = new dbModule.DrizzleAuditRepository();
    const filter = parseFilters(new URL(req.url).searchParams) as import("@contract/domain").AuditFilter;
    const [items, total] = await Promise.all([
      repo.find(filter),
      repo.count(filter),
    ]);

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        usuario: r.usuario,
        fecha: r.fecha.toISOString(),
        accion: r.accion,
        entidad: r.entidad,
        estadoAnterior: r.estadoAnterior,
        estadoNuevo: r.estadoNuevo,
        resultado: r.resultado,
        metadataSegura: r.metadataSegura,
      })),
      total,
      limit: filter.limit,
      offset: filter.offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}