import { NextResponse } from "next/server";
import { desc, isNotNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/directorio — directorio histórico de clientes eliminados.
 * Solo expone nombre, teléfono y documento (DNI/CE).
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const rows = await db
      .select({
        id: schema.clients.id,
        nombres: schema.clients.nombres,
        apellidos: schema.clients.apellidos,
        documentoIdentidad: schema.clients.documentoIdentidad,
        telefono: schema.clients.telefono,
        codigoPais: schema.clients.codigoPais,
        eliminadoEn: schema.clients.eliminadoEn,
      })
      .from(schema.clients)
      .where(isNotNull(schema.clients.eliminadoEn))
      .orderBy(desc(schema.clients.eliminadoEn));

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos ?? "",
        documentoIdentidad: row.documentoIdentidad,
        telefono: row.telefono ?? "",
        codigoPais: row.codigoPais ?? "51",
        eliminadoEn: row.eliminadoEn?.toISOString?.() ?? null,
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
