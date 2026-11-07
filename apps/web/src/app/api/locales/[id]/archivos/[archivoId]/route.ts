import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const BUCKET = "local-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: { id: string; archivoId: string } },
) {
  try {
    if (!UUID.test(params.id) || !UUID.test(params.archivoId)) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const [file] = await dbModule.db
      .select({
        nombre: dbModule.schema.localFiles.nombre,
        storageKey: dbModule.schema.localFiles.storageKey,
        mimeType: dbModule.schema.localFiles.mimeType,
      })
      .from(dbModule.schema.localFiles)
      .where(
        and(
          eq(dbModule.schema.localFiles.id, params.archivoId),
          eq(dbModule.schema.localFiles.localId, params.id),
        ),
      )
      .limit(1);
    if (!file) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    const bytes = await downloadObject(file.storageKey, BUCKET);
    const fallbackName = file.nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.nombre)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[locales] download attachment failed", error);
    return NextResponse.json(
      { error: "No se pudo descargar el archivo del local." },
      { status: 500 },
    );
  }
}
