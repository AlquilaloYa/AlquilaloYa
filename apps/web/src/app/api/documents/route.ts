import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/documents?contractId=... — lista documentos de un contrato (document.read). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.DOCUMENT_READ);
    if (denied) return denied;

    const contractId = new URL(req.url).searchParams.get("contractId");
    if (!contractId) {
      return NextResponse.json({ items: [] });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.contractId, contractId))
      .orderBy(schema.documents.createdAt);

    return NextResponse.json({
      items: rows.map((d) => ({
        id: d.id,
        contractId: d.contractId,
        snapshotId: d.snapshotId,
        tipo: d.tipo,
        version: d.version,
        storageKey: d.storageKey,
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        sha256: d.sha256,
        estadoGeneracion: d.estadoGeneracion,
        error: d.error,
        createdAt: d.createdAt?.toISOString?.() ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}