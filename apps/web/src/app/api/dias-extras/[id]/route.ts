import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await req.json().catch(() => null)) as { estado?: unknown } | null;
    if (body?.estado !== "PAGADO" && body?.estado !== "PENDIENTE") {
      return NextResponse.json({ error: "Estado de cobranza no válido." }, { status: 400 });
    }

    const [row] = await dbModule.db
      .update(dbModule.schema.diasExtras)
      .set({
        estado: body.estado,
        fechaPago: body.estado === "PAGADO"
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Lima",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date())
          : null,
        updatedAt: new Date(),
      })
      .where(eq(dbModule.schema.diasExtras.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "Cargo no encontrado." }, { status: 404 });

    await recordAdminAction(dbModule, auth.user, {
      action: "EXTRA_RENTAL_DAYS_PAYMENT_UPDATED",
      module: "PAYMENTS",
      entityType: "DIAS_EXTRAS",
      entityId: row.id,
      current: { estado: row.estado, fechaPago: row.fechaPago },
    });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el cobro" },
      { status: 500 },
    );
  }
}
