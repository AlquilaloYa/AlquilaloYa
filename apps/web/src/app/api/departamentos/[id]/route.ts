import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/departamentos/:id body: { precio?, garantia?, estadoManual?, personaPago?, maintenanceReason?, maintenanceEstimatedDays?, maintenanceStage? }
 * - precio  → mensualidad del departamento. Si no se envía garantía, esta se
 *   iguala automáticamente al precio (la garantía depende de la mensualidad).
 * - garantia→ valor independiente de la garantía (puede sobreescribirse aparte).
 * - estadoManual → modo manual del departamento: 'MANTENIMIENTO' | 'BLOQUEADO' |
 *   'DISPONIBLE'. 'DISPONIBLE' marca la unidad como disponible aunque tenga un
 *   contrato vencido (si no, el ERP la inferiría en mantenimiento); null vuelve
 *   al modo automático.
 *   'LIBRE' (o null) limpia el modo manual y vuelve al estado automático.
 * - personaPago → persona que cobra la renta de este departamento (Emely,
 *   Evelyn, Miguel u otro). Debe ser un texto no vacío.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const body = (await req.json()) as {
      precio?: string | number;
      garantia?: string | number;
      estadoManual?: string | null;
      motivoBloqueo?: string | null;
      personaPago?: string;
      maintenanceReason?: string | null;
      maintenanceEstimatedDays?: number | null;
      maintenanceStage?: string;
    };

    const values: Record<string, unknown> = {};
    const tienePrecio =
      "precio" in body && body.precio !== undefined && body.precio !== null && body.precio !== "";
    const tieneGarantia =
      "garantia" in body && body.garantia !== undefined && body.garantia !== null && body.garantia !== "";
    const tieneEstadoManual = "estadoManual" in body;
    const tieneMotivoBloqueo = "motivoBloqueo" in body;
    const tienePersonaPago =
      "personaPago" in body && body.personaPago !== undefined && body.personaPago !== null && String(body.personaPago).trim() !== "";
    const tieneMaintenanceReason = "maintenanceReason" in body;
    const tieneMaintenanceEstimatedDays = "maintenanceEstimatedDays" in body;
    const tieneMaintenanceStage = "maintenanceStage" in body;

    if (
      !tienePrecio &&
      !tieneGarantia &&
      !tieneEstadoManual &&
      !tieneMotivoBloqueo &&
      !tienePersonaPago &&
      !tieneMaintenanceReason &&
      !tieneMaintenanceEstimatedDays &&
      !tieneMaintenanceStage
    ) {
      return NextResponse.json(
        { error: "Indica el precio (mensualidad), la garantía, el estado manual y/o la persona de pago" },
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
    if (tieneEstadoManual) {
      const estado = body.estadoManual;
      const valido =
        estado === "MANTENIMIENTO" ||
        estado === "BLOQUEADO" ||
        estado === "DISPONIBLE" ||
        estado === "LIBRE" ||
        estado === null ||
        estado === undefined ||
        estado === "";
      if (!valido) {
        return NextResponse.json({ error: "Estado manual inválido" }, { status: 400 });
      }
      values.estadoManual =
        estado === "MANTENIMIENTO" || estado === "BLOQUEADO" || estado === "DISPONIBLE"
          ? estado
          : null;
      values.estadoManualUpdatedAt = new Date();
    }
    if (tieneMotivoBloqueo) {
      const motivo = typeof body.motivoBloqueo === "string" ? body.motivoBloqueo.trim() : "";
      if (motivo.length > 500) {
        return NextResponse.json({ error: "La causa no puede superar 500 caracteres" }, { status: 400 });
      }
      values.motivoBloqueo = motivo || null;
    }
    if (tieneMaintenanceReason) {
      const reason = typeof body.maintenanceReason === "string" ? body.maintenanceReason.trim() : "";
      if (reason.length > 1000) {
        return NextResponse.json({ error: "El motivo del mantenimiento no puede superar 1000 caracteres" }, { status: 400 });
      }
      values.maintenanceReason = reason || null;
    }
    if (tieneMaintenanceEstimatedDays) {
      const days = body.maintenanceEstimatedDays;
      if (days !== null && (!Number.isInteger(days) || Number(days) < 0 || Number(days) > 3650)) {
        return NextResponse.json({ error: "La demora estimada debe ser un número entero entre 0 y 3650 días" }, { status: 400 });
      }
      values.maintenanceEstimatedDays = days ?? null;
    }
    if (tieneMaintenanceStage) {
      const stages = ["PENDIENTE", "DIAGNOSTICO", "REPARACION", "VERIFICACION"];
      if (!stages.includes(body.maintenanceStage ?? "")) {
        return NextResponse.json({ error: "La etapa de mantenimiento no es válida" }, { status: 400 });
      }
      values.maintenanceStage = body.maintenanceStage;
    }
    if (tieneEstadoManual && body.estadoManual !== "MANTENIMIENTO") {
      values.maintenanceReason = null;
      values.maintenanceEstimatedDays = null;
      values.maintenanceStage = "PENDIENTE";
    }
    if (tienePersonaPago) {
      values.personaPago = String(body.personaPago).trim();
    }
    if (tienePrecio || tieneGarantia || tienePersonaPago) values.updatedAt = new Date();

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