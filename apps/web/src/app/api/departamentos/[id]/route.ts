import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/departamentos/:id  body: { precio?, garantia? }
 * - precio  → mensualidad del departamento. Si no se envía garantía, esta se
 *   iguala automáticamente al precio (la garantía depende de la mensualidad).
 * - garantia→ valor independiente de la garantía (puede sobreescribirse aparte).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const body = (await req.json()) as { precio?: string | number; garantia?: string | number };

    const values: Record<string, unknown> = {};
    const tienePrecio =
      "precio" in body && body.precio !== undefined && body.precio !== null && body.precio !== "";
    const tieneGarantia =
      "garantia" in body && body.garantia !== undefined && body.garantia !== null && body.garantia !== "";

    if (!tienePrecio && !tieneGarantia) {
      return NextResponse.json(
        { error: "Indica el precio (mensualidad) y/o la garantía" },
        { status: 400 }
      );
    }

    if (tienePrecio) {
      const precio = Number(body.precio);
      if (isNaN(precio) || precio < 0) {
        return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
      }
      values.precio = String(precio.toFixed(2));
      // La garantía depende de la mensualidad: si no se indica, la iguala.
      if (!tieneGarantia) values.garantia = String(precio.toFixed(2));
    }
    if (tieneGarantia) {
      const garantia = Number(body.garantia);
      if (isNaN(garantia) || garantia < 0) {
        return NextResponse.json({ error: "Garantía inválida" }, { status: 400 });
      }
      values.garantia = String(garantia.toFixed(2));
    }
    values.updatedAt = new Date();

    const row = await db
      .update(schema.departments)
      .set(values)
      .where(eq(schema.departments.id, params.id))
      .returning();

    if (row.length === 0) {
      return NextResponse.json(
        { error: "Departamento no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(row[0]);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}