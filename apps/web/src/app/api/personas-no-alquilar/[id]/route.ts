import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** DELETE /api/personas-no-alquilar/:id — retira a la persona de la lista negra. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq, isNull, and } = await import("drizzle-orm");

    const [row] = await db
      .select({
        id: schema.personasNoAlquilar.id,
        fotoStorageKey: schema.personasNoAlquilar.fotoStorageKey,
      })
      .from(schema.personasNoAlquilar)
      .where(
        and(
          eq(schema.personasNoAlquilar.id, params.id),
          isNull(schema.personasNoAlquilar.eliminadoEn)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    if (row.fotoStorageKey) {
      await deleteObject(row.fotoStorageKey).catch(() => undefined);
    }

    await db
      .update(schema.personasNoAlquilar)
      .set({
        eliminadoEn: new Date(),
        fotoStorageKey: null,
        fotoMimeType: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.personasNoAlquilar.id, row.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
