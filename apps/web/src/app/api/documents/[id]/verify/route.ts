import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import {
  findDocumentById,
  verifyDocumentIntegrity,
} from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/:id/verify — verifica la integridad del documento:
 * descarga el PDF del bucket privado y compara su sha256 con el persistido.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
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
    const row = await findDocumentById(db, schema, params.id);
    if (!row) {
      return NextResponse.json(
        { error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    const result = await verifyDocumentIntegrity(row);
    return NextResponse.json({
      id: row.id,
      filename: row.filename,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
