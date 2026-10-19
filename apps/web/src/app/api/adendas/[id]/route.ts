import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { findDocumentById } from "@/lib/documents";
import { renderAdendaHtml } from "@/lib/pdf/render-adenda-html";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/adendas/:id
 * Detalle de una adenda para su edición: devuelve el HTML actual (el congelado
 * en el snapshot o, si no hay, el render generado como plantilla base) y los
 * metadatos del snapshot.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DOCUMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const doc = await findDocumentById(db, schema, params.id);
    if (!doc) {
      return NextResponse.json({ error: "Adenda no encontrada" }, { status: 404 });
    }
    if (!["ADENDA", "ADENDA_EXTENSION"].includes(doc.tipo)) {
      return NextResponse.json(
        { error: "El documento no es una adenda" },
        { status: 400 }
      );
    }
    if (!doc.snapshotId) {
      return NextResponse.json(
        { error: "La adenda no tiene snapshot asociado" },
        { status: 400 }
      );
    }

    const { snapshotRepository } = await buildContractServices();
    const snapshot = await snapshotRepository.findById(doc.snapshotId);
    if (!snapshot) {
      return NextResponse.json(
        { error: "Snapshot de la adenda no encontrado" },
        { status: 404 }
      );
    }

    const documentoHtml = snapshot.documentoHtml ?? null;
    // Base para editar: el HTML congelado o el render actual como plantilla.
    const htmlActual = documentoHtml ?? (await renderAdendaHtml(snapshot));

    return NextResponse.json({
      id: doc.id,
      contractId: doc.contractId,
      snapshotId: doc.snapshotId,
      tipo: doc.tipo,
      filename: doc.filename,
      codigoContrato: snapshot.codigoContrato,
      documentoHtml,
      htmlActual,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
