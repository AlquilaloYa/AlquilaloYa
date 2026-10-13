import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { deleteObject } from "@/lib/storage";
import { regenerarPdfServicioExtra } from "@/lib/servicios-extras-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      .select()
      .from(schema.serviciosExtras)
      .where(eq(schema.serviciosExtras.id, id))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * PATCH /api/servicios-extras/:id
 * Edita las opciones y fechas del servicio extra y regenera el PDF con los
 * datos vigentes. body: { incluyeInternet?, incluyeCargaElectrica?, fechaOpcion?, fechaPago? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const body = (await req.json().catch(() => ({}))) as {
      incluyeInternet?: boolean;
      incluyeCargaElectrica?: boolean;
      fechaOpcion?: string;
      fechaPago?: string | null;
    };

    const [existing] = await db
      .select()
      .from(schema.serviciosExtras)
      .where(eq(schema.serviciosExtras.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const internet = body.incluyeInternet ?? existing.incluyeInternet;
    const carga = body.incluyeCargaElectrica ?? existing.incluyeCargaElectrica;
    if (!internet && !carga) {
      return NextResponse.json(
        { error: "Debe seleccionar al menos un servicio" },
        { status: 400 },
      );
    }

    const tipoServicio = internet && carga ? "AMBOS" : internet ? "INTERNET" : "CARGA_ELECTRICA";
    const montoTotal = String(Number(internet ? 39 : 0) + Number(carga ? 60 : 0));

    const [row] = await db
      .update(schema.serviciosExtras)
      .set({
        incluyeInternet: internet,
        incluyeCargaElectrica: carga,
        tipoServicio,
        montoTotal,
        fechaOpcion: body.fechaOpcion || existing.fechaOpcion,
        fechaPago: body.fechaPago !== undefined ? body.fechaPago : existing.fechaPago,
        updatedAt: new Date(),
      })
      .where(eq(schema.serviciosExtras.id, id))
      .returning();

    if (!row) {
      return NextResponse.json(
        { error: "No se pudo actualizar el servicio extra" },
        { status: 500 },
      );
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "SERVICIOS_EXTRAS_UPDATED",
      module: "CONTRACTS",
      entityType: "SERVICIOS_EXTRAS",
      entityId: row.id,
      current: { tipoServicio, fechaOpcion: row.fechaOpcion, fechaPago: row.fechaPago },
    });

    try {
      const { row: regenerado } = await regenerarPdfServicioExtra(db, schema, row);
      return NextResponse.json(regenerado);
    } catch (e) {
      console.error("No se pudo regenerar el PDF de servicios extras", e);
      return NextResponse.json(row);
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/servicios-extras/:id — elimina el registro y su PDF almacenado. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select()
      .from(schema.serviciosExtras)
      .where(eq(schema.serviciosExtras.id, id))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    if (row.storageKey) {
      try {
        await deleteObject(row.storageKey);
      } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
      }
    }

    await db.delete(schema.serviciosExtras).where(eq(schema.serviciosExtras.id, id));

    await recordAdminAction(dbModule, auth.user, {
      action: "SERVICIOS_EXTRAS_DELETED",
      module: "CONTRACTS",
      entityType: "SERVICIOS_EXTRAS",
      entityId: row.id,
      current: { contractId: row.contractId, tipoServicio: row.tipoServicio },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
