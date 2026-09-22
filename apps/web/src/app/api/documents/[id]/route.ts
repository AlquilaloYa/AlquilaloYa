import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { findDocumentById } from "@/lib/documents";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** DELETE /api/documents/:id — elimina un documento (solo ADMIN). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DOCUMENT_READ);
    if (denied) return denied;
    if (auth.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo un administrador puede eliminar documentos" },
        { status: 403 }
      );
    }

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

    if (row.storageKey) {
      try {
        await deleteObject(row.storageKey);
      } catch (error) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 500 }
        );
      }
    }

    const { eq } = await import("drizzle-orm");
    await db
      .delete(schema.documents)
      .where(eq(schema.documents.id, row.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}