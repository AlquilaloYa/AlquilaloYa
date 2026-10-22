import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const BUCKET = "gastos";

/** GET /api/gastos/:id/comprobante — sirve la foto/PDF del comprobante (bucket privado). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const [row] = await db
      .select({
        comprobante: schema.gastos.comprobante,
        comprobanteMimeType: schema.gastos.comprobanteMimeType,
      })
      .from(schema.gastos)
      .where(eq(schema.gastos.id, params.id))
      .limit(1);

    if (!row?.comprobante) {
      return NextResponse.json({ error: "Sin comprobante registrado" }, { status: 404 });
    }

    const bytes = await downloadObject(row.comprobante, BUCKET);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.comprobanteMimeType || "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
