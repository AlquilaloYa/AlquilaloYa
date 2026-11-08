import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "local-assets";

export async function GET(
  request: Request,
  { params }: { params: { documentId: string } },
) {
  try {
    if (!UUID.test(params.documentId)) {
      return NextResponse.json({ error: "Identificador de documento inválido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const [document] = await dbModule.db
      .select({
        nombre: dbModule.schema.localContractDocuments.nombre,
        storageKey: dbModule.schema.localContractDocuments.storageKey,
        mimeType: dbModule.schema.localContractDocuments.mimeType,
      })
      .from(dbModule.schema.localContractDocuments)
      .where(eq(dbModule.schema.localContractDocuments.id, params.documentId))
      .limit(1);
    if (!document) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

    const bytes = await downloadObject(document.storageKey, BUCKET);
    const fallbackName = document.nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(document.nombre)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[locales] download contract document failed", error);
    return NextResponse.json({ error: "No se pudo descargar el documento." }, { status: 500 });
  }
}
