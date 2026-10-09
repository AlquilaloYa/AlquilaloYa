import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string; documentId: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_READ);
    if (denied) return denied;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const [row] = await db.select().from(schema.hrEmployeeDocuments)
      .where(and(eq(schema.hrEmployeeDocuments.id, params.documentId), eq(schema.hrEmployeeDocuments.employeeId, params.id))).limit(1);
    if (!row) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    const bytes = await downloadObject(row.storageKey, "hr-documents");
    if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) return NextResponse.json({ error: "La integridad del documento no coincide" }, { status: 409 });
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(row.sizeBytes),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.nombre)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}