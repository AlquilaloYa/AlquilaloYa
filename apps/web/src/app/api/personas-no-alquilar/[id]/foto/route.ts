import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** GET /api/personas-no-alquilar/:id/foto — sirve la foto del DNI (bucket privado). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
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
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select({
        fotoStorageKey: schema.personasNoAlquilar.fotoStorageKey,
        fotoMimeType: schema.personasNoAlquilar.fotoMimeType,
      })
      .from(schema.personasNoAlquilar)
      .where(eq(schema.personasNoAlquilar.id, params.id))
      .limit(1);

    if (!row?.fotoStorageKey) {
      return NextResponse.json({ error: "Sin foto registrada" }, { status: 404 });
    }

    const bytes = await downloadObject(row.fotoStorageKey);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.fotoMimeType || "image/jpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
