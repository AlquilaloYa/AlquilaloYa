import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import {
  ensureContractPdfDocument,
  getStoredDocumentBytes,
  DocumentIntegrityError,
} from "@/lib/documents";
import { buildNotarialPdf } from "@/lib/notarial-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/documents/notarial?contractId=...
 * Descarga "para notaría": el PDF del contrato congelado (bytes verbatim) + las
 * copias de DNI del contacto anexadas como páginas reales. Sin pérdida y sin
 * modificar el archivo base.
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DOCUMENT_READ);
    if (denied) return denied;

    const contractId = new URL(req.url).searchParams.get("contractId");
    if (!contractId) {
      return NextResponse.json({ error: "Falta contractId" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { contractRepository } = await buildContractServices();

    const row = await ensureContractPdfDocument(db, schema, contractRepository, contractId);
    if (!row || !row.storageKey) {
      return NextResponse.json(
        { error: "El contrato aún no tiene PDF generado (emítelo primero)." },
        { status: 400 }
      );
    }

    let baseBytes: Uint8Array;
    try {
      baseBytes = await getStoredDocumentBytes(row);
    } catch (e) {
      if (e instanceof DocumentIntegrityError) {
        return NextResponse.json({ error: "Documento alterado (sha256)." }, { status: 409 });
      }
      throw e;
    }

    const contract = await contractRepository.findById(contractId);
    const out = await buildNotarialPdf(
      baseBytes,
      (contract?.copiaDni ?? []) as import("@/lib/notarial-pdf").NotarialAttachment[]
    );

    const filename = `${contract?.codigoContrato ?? "contrato"}-NOTARIA.pdf`;
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
