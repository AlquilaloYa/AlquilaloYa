import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const BUCKET = "blacklist";

/**
 * GET /api/personas-no-alquilar/:id/foto?i=0 — sirve una de las fotos de la
 * persona (bucket privado). Por defecto la primera.
 */
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
      .select({ fotos: schema.personasNoAlquilar.fotos })
      .from(schema.personasNoAlquilar)
      .where(eq(schema.personasNoAlquilar.id, params.id))
      .limit(1);

    const fotos = row?.fotos ?? [];
    if (fotos.length === 0) {
      return NextResponse.json({ error: "Sin foto registrada" }, { status: 404 });
    }

    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("i") ?? 0);
    const indice = Number.isInteger(raw) && raw >= 0 ? raw : 0;
    const foto = fotos[indice];
    if (!foto) {
      return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    }

    const bytes = await downloadObject(foto.key, BUCKET);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": foto.mimeType || "image/jpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
