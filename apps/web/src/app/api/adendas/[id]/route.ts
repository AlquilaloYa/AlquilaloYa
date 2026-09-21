import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/adendas/:id  — detalle de una adenda para editarla.
 * Devuelve datosContrato (título, numeración, fechas) y el anexo con su
 * contenido para precargar el modal de edición.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DOCUMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");
    const { id } = await params;

    const [row] = await db
      .select({
        id: schema.documents.id,
        contractId: schema.documents.contractId,
        snapshotId: schema.documents.snapshotId,
        tipo: schema.documents.tipo,
        version: schema.documents.version,
        filename: schema.documents.filename,
        estadoGeneracion: schema.documents.estadoGeneracion,
        createdAt: schema.documents.createdAt,
        datosContrato: schema.contractSnapshots.datosContrato,
        anexos: schema.contractSnapshots.anexos,
        codigoContrato: schema.contracts.codigoContrato,
      })
      .from(schema.documents)
      .innerJoin(schema.contracts, eq(schema.documents.contractId, schema.contracts.id))
      .leftJoin(
        schema.contractSnapshots,
        eq(schema.documents.snapshotId, schema.contractSnapshots.id)
      )
      .where(eq(schema.documents.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Adenda no encontrada" }, { status: 404 });
    }
    if (!["ADENDA", "ADENDA_EXTENSION"].includes(row.tipo)) {
      return NextResponse.json({ error: "El documento no es una adenda" }, { status: 400 });
    }

    const anexoContenido = Array.isArray(row.anexos)
      ? String((row.anexos[0] as Record<string, unknown> | undefined)?.contenido ?? "")
      : "";

    return NextResponse.json({
      id: row.id,
      contractId: row.contractId,
      snapshotId: row.snapshotId,
      tipo: row.tipo,
      version: row.version,
      filename: row.filename,
      estadoGeneracion: row.estadoGeneracion,
      createdAt: row.createdAt?.toISOString?.() ?? null,
      codigoContrato: row.codigoContrato,
      datosContrato: row.datosContrato as Record<string, unknown> | null,
      anexoContenido,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}