import { NextResponse } from "next/server";
import type { ContractSnapshot } from "@contract/domain/snapshot";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { generateAdendaPdf, generateContractPdf } from "@/lib/pdf/generate-pdf";
import {
  DocumentIntegrityError,
  ensureContractPdfDocument,
  findDocumentById,
  findDocumentBySnapshot,
  getStoredDocumentBytes,
  registerGeneratedDocument,
} from "@/lib/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/documents/pdf — descarga de documentos (Fase 4: storage-first).
 * - ?documentId=...   → sirve el PDF almacenado en storage (verifica sha256).
 * - ?contractId=...   → garantiza el PDF del contrato (lo genera y almacena si falta).
 * - ?snapshotId=...   → documento del snapshot (p. ej. adenda); si no está
 *   almacenado, regenera desde el snapshot inmutable y lo persiste.
 */
export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const documentId = url.searchParams.get("documentId");
    const contractId = url.searchParams.get("contractId");
    const snapshotId = url.searchParams.get("snapshotId");
    // La descarga normal NUNCA regenera (no toca el PDF congelado con sus
    // imágenes). Reparar ante corrupción es una acción explícita de ADMIN.
    const repair =
      url.searchParams.get("repair") === "1" && auth.user.role === "ADMIN";

    // --- 1) Descarga directa de un documento almacenado ---
    if (documentId) {
      const row = await findDocumentById(db, schema, documentId);
      if (!row) {
        return NextResponse.json(
          { error: "Documento no encontrado" },
          { status: 404 }
        );
      }
      if (row.storageKey) {
        try {
          const bytes = await getStoredDocumentBytes(row);
          return pdfResponse(bytes, row.filename);
        } catch (e) {
          // Sin flag de reparación admin, NO regeneramos: propagamos el error de
          // integridad (409) y servimos/custodiamos el archivo congelado intacto.
          if (!(e instanceof DocumentIntegrityError) || !repair || !row.snapshotId) {
            throw e;
          }
          // Auto-reparación: regenera desde el snapshot inmutable y repone
          // el objeto corrupto del bucket con su huella original.
          const { snapshotRepository } = await buildContractServices();
          const snapshot = await snapshotRepository.findById(row.snapshotId);
          if (!snapshot || !snapshot.inmutable) throw e;
          const pdf = await renderPdf(snapshot);
          const fixed = await registerGeneratedDocument(db, schema, {
            contractId: row.contractId,
            snapshotId: row.snapshotId,
            tipo: row.tipo,
            version: row.version,
            filename: pdf.filename,
            bytes: pdf.bytes,
            idempotencyKey: row.idempotencyKey,
            force: true,
          });
          const bytes = await getStoredDocumentBytes(fixed);
          return pdfResponse(bytes, fixed.filename);
        }
      }
      if (!row.snapshotId) {
        return NextResponse.json(
          { error: "El documento no tiene copia almacenada ni snapshot para regenerarlo" },
          { status: 400 }
        );
      }
      // Sin storageKey: regenera desde el snapshot y persiste (backfill).
      const { snapshotRepository } = await buildContractServices();
      const snapshot = await snapshotRepository.findById(row.snapshotId);
      if (!snapshot || !snapshot.inmutable) {
        return NextResponse.json(
          { error: "No hay snapshot inmutable para regenerar el documento." },
          { status: 400 }
        );
      }
      const pdf = await renderPdf(snapshot);
      await registerGeneratedDocument(db, schema, {
        contractId: row.contractId,
        snapshotId: row.snapshotId,
        tipo: row.tipo,
        version: row.version,
        filename: pdf.filename,
        bytes: pdf.bytes,
        idempotencyKey: row.idempotencyKey,
      });
      return pdfResponse(pdf.bytes, pdf.filename);
    }

    // --- 2) PDF del contrato: garantiza que exista y esté almacenado ---
    if (contractId) {
      const { contractRepository, snapshotRepository } =
        await buildContractServices();
      const row = await ensureContractPdfDocument(
        db,
        schema,
        contractRepository,
        contractId
      );
      if (!row) {
        return NextResponse.json(
          { error: "No hay snapshot inmutable para generar el documento." },
          { status: 400 }
        );
      }
      if (row.storageKey) {
        const bytes = await getStoredDocumentBytes(row);
        return pdfResponse(bytes, row.filename);
      }
      // Storage no configurado: fallback a regeneración en vivo.
      if (!row.snapshotId) {
        return NextResponse.json(
          { error: "El documento no tiene snapshot asociado" },
          { status: 400 }
        );
      }
      const snapshot = await snapshotRepository.findById(row.snapshotId);
      if (!snapshot) {
        return NextResponse.json(
          { error: "Snapshot no encontrado" },
          { status: 404 }
        );
      }
      const pdf = await renderPdf(snapshot);
      return pdfResponse(pdf.bytes, pdf.filename);
    }

    // --- 3) Documento de un snapshot (adenda / histórico) ---
    if (snapshotId) {
      const row = await findDocumentBySnapshot(db, schema, snapshotId);
      if (row?.storageKey) {
        const bytes = await getStoredDocumentBytes(row);
        return pdfResponse(bytes, row.filename);
      }

      const { snapshotRepository } = await buildContractServices();
      const snapshot = await snapshotRepository.findById(snapshotId);
      if (!snapshot || !snapshot.inmutable) {
        return NextResponse.json(
          { error: "No hay snapshot inmutable para generar el documento." },
          { status: 400 }
        );
      }
      const pdf = await renderPdf(snapshot);
      if (row) {
        await registerGeneratedDocument(db, schema, {
          contractId: row.contractId,
          snapshotId: row.snapshotId!,
          tipo: row.tipo,
          version: row.version,
          filename: pdf.filename,
          bytes: pdf.bytes,
          idempotencyKey: row.idempotencyKey,
        });
      }
      return pdfResponse(pdf.bytes, pdf.filename);
    }

    return NextResponse.json(
      { error: "documentId, contractId o snapshotId requerido" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof DocumentIntegrityError) {
      return NextResponse.json(
        {
          error: "Integridad comprometida: el archivo almacenado no coincide con su huella sha256.",
          expected: error.expected,
          actual: error.actual,
        },
        { status: 409 }
      );
    }
    const message = (error as Error).message;
    const status =
      /no está emitido|snapshot|requerido/i.test(message) ||
      message.includes("Chrome")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Elige el renderer según el tipo de documento congelado en el snapshot. */
async function renderPdf(snapshot: ContractSnapshot) {
  const tipoDocumento = (snapshot.datosContrato as
    | { tipoDocumento?: string }
    | undefined)?.tipoDocumento;
  if (tipoDocumento === "ADENDA" || tipoDocumento === "ADENDA_EXTENSION") {
    return generateAdendaPdf(snapshot);
  }

  // Buscar HTML de la plantilla para usarlo como base
  let templateHtml: string | null = null;
  if (snapshot.plantillaVersionId) {
    try {
      const dbModule = await import("@contract/db");
      const { eq } = await import("drizzle-orm");
      const [tv] = await dbModule.db
        .select({ contenido: dbModule.schema.templateVersions.contenido })
        .from(dbModule.schema.templateVersions)
        .where(eq(dbModule.schema.templateVersions.id, snapshot.plantillaVersionId))
        .limit(1);
      templateHtml = tv?.contenido ?? null;
    } catch {
      // fallback a formato genérico
    }
  }

  return generateContractPdf(snapshot, templateHtml);
}

function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
