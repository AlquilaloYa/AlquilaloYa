import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  findCurrentClientContract,
  resolveClientPortalIdentity,
} from "@/lib/client-portal-auth";
import { getStoredDocumentBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TIPOS = ["CONTRATO_PDF", "ADENDA", "ADENDA_EXTENSION"];

/** GET /api/portal-cliente/contratos/documento?id=… — descarga el PDF del contrato o adenda del inquilino. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get("id") ?? "";
    if (!UUID_PATTERN.test(documentId)) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json(
        { error: "Sesión no válida." },
        { status: 401 },
      );
    }
    const contract = await findCurrentClientContract(
      dbModule,
      session.identity.client.id,
      session.identity.client.departmentCode,
    );
    if (!contract) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    const [row] = await dbModule.db
      .select()
      .from(dbModule.schema.documents)
      .where(
        and(
          eq(dbModule.schema.documents.id, documentId),
          inArray(dbModule.schema.documents.tipo, ALLOWED_TIPOS),
          eq(dbModule.schema.documents.estadoGeneracion, "GENERADO"),
          isNull(dbModule.schema.documents.eliminadoEn),
        ),
      )
      .limit(1);
    if (
      !row ||
      row.contractId !== contract.id ||
      !row.storageKey
    ) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    const bytes = await getStoredDocumentBytes(row);
    const response = new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener el documento.",
      },
      { status: 500 },
    );
  }
}
