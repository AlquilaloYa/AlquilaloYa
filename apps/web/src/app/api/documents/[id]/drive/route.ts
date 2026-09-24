import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { findDocumentById } from "@/lib/documents";
import { downloadObject } from "@/lib/storage";
import { GcalNotConnected } from "@/lib/google-calendar";
import { nombreDeStorageKey, subirArchivoADrive } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

/**
 * POST /api/documents/:id/drive — sube el PDF del documento al Google Drive
 * del usuario conectado (carpeta "AlquilaYa ERP").
 */
export async function POST(
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
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }
    if (!row.storageKey) {
      return NextResponse.json(
        { error: "El documento no tiene PDF guardado en el sistema (emítelo primero)." },
        { status: 400 }
      );
    }

    const bytes = await downloadObject(row.storageKey);
    const name = row.filename ?? nombreDeStorageKey(row.storageKey);

    const result = await subirArchivoADrive({
      userEmail: auth.user.email,
      name,
      mimeType: "application/pdf",
      bytes,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink || null,
    });
  } catch (error) {
    if (error instanceof GcalNotConnected) {
      return NextResponse.json(
        { error: "No hay cuenta de Google conectada. Conéctala en /agenda." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}