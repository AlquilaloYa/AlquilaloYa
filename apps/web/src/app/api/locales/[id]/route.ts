import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { parseLocal, type LocalInput } from "@/lib/locales-validation";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!UUID.test(params.id)) {
      return NextResponse.json({ error: "Identificador de local inválido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    const parsed = parseLocal(body as LocalInput);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const [row] = await dbModule.db
      .update(dbModule.schema.locales)
      .set({ ...parsed.value, updatedAt: new Date() })
      .where(eq(dbModule.schema.locales.id, params.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Ese código ya está asignado a otro local." },
        { status: 409 },
      );
    }
    console.error("[locales] update failed", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el local." },
      { status: 500 },
    );
  }
}
