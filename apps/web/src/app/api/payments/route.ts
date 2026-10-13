import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

/** suma `dias` a una fecha ISO local (YYYY-MM-DD) en la misma zona local. */
function sumarDias(iso: string, dias: number): string {
  const p = iso.slice(0, 10).split("-");
  const d = new Date(Number(p[0]), Number(p[1] ?? 1) - 1, Number(p[2] ?? 1));
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Filtra y normaliza la lista de vouchers adjuntos (solo JPEG dataURL). */
function normalizarVouchers(input: unknown): {
  nombre: string;
  url: string;
  monto?: number;
}[] {
  if (!Array.isArray(input)) return [];
  const out: { nombre: string; url: string; monto?: number }[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const nombre = (item as Record<string, unknown>).nombre;
    const url = (item as Record<string, unknown>).url;
    const montoRaw = (item as Record<string, unknown>).monto;
    if (
      typeof nombre === "string" &&
      /\.(jpe?g)$/i.test(nombre) &&
      typeof url === "string" &&
      url.startsWith("data:image/jpeg")
    ) {
      const voucher: { nombre: string; url: string; monto?: number } = {
        nombre,
        url,
      };
      const monto = Number(montoRaw);
      if (Number.isFinite(monto) && monto >= 0) voucher.monto = monto;
      out.push(voucher);
    }
  }
  return out;
}

/** Total del mes que debe cubrir un pago (canon + mantenimiento). */
function totalDelMes(monto: unknown, mantenimiento: unknown): number {
  return Number(monto ?? 0) + Number(mantenimiento ?? 50);
}

/**
 * Deriva el monto abonado y el estado de un pago a partir de los montos de sus
 * vouchers. Si ningún voucher trae monto, se respeta `estadoFallback`.
 */
function derivarPago(
  vouchers: { monto?: number }[],
  total: number,
  estadoFallback: string,
): { montoPagado: number; estado: string } {
  const tieneMontos = vouchers.some((v) => typeof v.monto === "number");
  if (!tieneMontos) return { montoPagado: 0, estado: estadoFallback };
  const montoPagado = vouchers.reduce((s, v) => s + (Number(v.monto) || 0), 0);
  if (montoPagado <= 0) return { montoPagado, estado: "PENDIENTE" };
  if (montoPagado + 0.001 >= total) return { montoPagado, estado: "PAGADO" };
  return { montoPagado, estado: "PARCIAL" };
}

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const contractId = url.searchParams.get("contractId");

    const base = db.select().from(schema.payments);
    const rows = contractId
      ? await base.where(eq(schema.payments.contractId, contractId))
      : await base;

    return NextResponse.json(
      rows.map((p) => ({
        ...p,
        voucherUrl: contractId ? p.voucherUrl : null,
        periodo: toDateStr(p.periodo),
        fechaPago: p.fechaPago ? toDateStr(p.fechaPago) : null,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = await req.json();
    if (!body.contractId || !body.periodo) {
      return NextResponse.json(
        { error: "contractId y periodo son requeridos" },
        { status: 400 }
      );
    }
    const estadoIn = (body.estado ?? "PENDIENTE") as string;
    const vouchers = normalizarVouchers(body.vouchers);
    if (
      estadoIn === "PAGADO" &&
      vouchers.length === 0 &&
      (typeof body.voucherUrl !== "string" ||
        !body.voucherUrl.startsWith("data:image/jpeg") ||
        !(typeof body.voucherNombre === "string" &&
          /\.(jpe?g)$/i.test(body.voucherNombre)))
    ) {
      return NextResponse.json(
        { error: "El pago solo se confirma con al menos un baucher en imagen JPEG" },
        { status: 400 }
      );
    }
    const vouchersFinal: { nombre: string; url: string; monto?: number }[] =
      vouchers.length > 0
        ? vouchers
        : typeof body.voucherUrl === "string" && typeof body.voucherNombre === "string"
          ? [{ nombre: body.voucherNombre, url: body.voucherUrl }]
          : [];

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    // Morosidad: se aplica la penalidad fija de S/ 70 recién cuando el pago
    // se registra después del vencimiento más el período de indulgencia
    // (días de prórroga fijados manualmente en Cobranza).
    const { and, eq } = await import("drizzle-orm");

    const per = String(body.periodo).slice(0, 10);
    const [existente] = await db
      .select({ diasIndulgencia: schema.payments.diasIndulgencia })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.contractId, body.contractId),
          eq(schema.payments.periodo, per)
        )
      )
      .limit(1);
    const indulgencia = Number(
      body.diasIndulgencia ?? existente?.diasIndulgencia ?? 0
    );

    const total = totalDelMes(body.monto, body.mantenimiento);
    const { montoPagado, estado } = derivarPago(vouchersFinal, total, estadoIn);
    const fechaPago: string | null =
      estado === "PAGADO"
        ? typeof body.fechaPago === "string"
          ? body.fechaPago
          : new Date().toISOString().slice(0, 10)
        : body.fechaPago ?? null;
    const penalidadEfectiva =
      estado === "PAGADO" && fechaPago && fechaPago > sumarDias(per, indulgencia)
        ? "70.00"
        : "0";

    const [row] = await db
      .insert(schema.payments)
      .values({
        contractId: body.contractId,
        periodo: per,
        monto: body.monto ?? "0",
        mantenimiento: body.mantenimiento ?? "50",
        penalidad: penalidadEfectiva,
        montoPagado: montoPagado.toFixed(2),
        diasIndulgencia: indulgencia,
        estado,
        fechaPago,
        vouchers: vouchersFinal,
        voucherNombre: vouchersFinal[0]?.nombre ?? body.voucherNombre ?? null,
        voucherUrl: vouchersFinal[0]?.url ?? body.voucherUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.payments.contractId, schema.payments.periodo],
        set: {
          monto: body.monto ?? "0",
          mantenimiento: body.mantenimiento ?? "50",
          penalidad: penalidadEfectiva,
          montoPagado: montoPagado.toFixed(2),
          diasIndulgencia: indulgencia,
          estado,
          fechaPago,
          vouchers: vouchersFinal,
          voucherNombre: vouchersFinal[0]?.nombre ?? body.voucherNombre ?? null,
          voucherUrl: vouchersFinal[0]?.url ?? body.voucherUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 });
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "PAYMENT_REGISTERED",
      module: "PAYMENTS",
      entityType: "PAYMENT",
      entityId: row.id,
      current: {
        contractId: row.contractId,
        periodo: toDateStr(row.periodo),
        estado: row.estado,
        monto: row.monto,
        penalidad: row.penalidad,
      },
    });

    return NextResponse.json(
      { ...row, periodo: toDateStr(row.periodo), fechaPago: row.fechaPago ? toDateStr(row.fechaPago) : null },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const { id, ...patch } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { sql } = await import("drizzle-orm");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if ("estado" in patch) values.estado = patch.estado;
    if ("fechaPago" in patch) values.fechaPago = patch.fechaPago ?? null;
    if ("voucherNombre" in patch) values.voucherNombre = patch.voucherNombre ?? null;
    if ("voucherUrl" in patch) values.voucherUrl = patch.voucherUrl ?? null;
    if ("vouchers" in patch) values.vouchers = normalizarVouchers(patch.vouchers);
    if ("monto" in patch) values.monto = patch.monto;
    if ("mantenimiento" in patch) values.mantenimiento = patch.mantenimiento;
    if ("penalidad" in patch) values.penalidad = patch.penalidad;
    if ("montoPagado" in patch) values.montoPagado = patch.montoPagado;
    if ("diasIndulgencia" in patch)
      values.diasIndulgencia = Math.max(0, Math.floor(Number(patch.diasIndulgencia) || 0));

    const tocaPago =
      "vouchers" in patch ||
      "estado" in patch ||
      "monto" in patch ||
      "mantenimiento" in patch ||
      "montoPagado" in patch;

    if (tocaPago) {
      const [existente] = await db
        .select({
          voucherUrl: schema.payments.voucherUrl,
          voucherNombre: schema.payments.voucherNombre,
          vouchers: schema.payments.vouchers,
          monto: schema.payments.monto,
          mantenimiento: schema.payments.mantenimiento,
          estado: schema.payments.estado,
          periodo: schema.payments.periodo,
          fechaPago: schema.payments.fechaPago,
          diasIndulgencia: schema.payments.diasIndulgencia,
        })
        .from(schema.payments)
        .where(sql`id = ${id}`)
        .limit(1);

      const vouchers: { nombre: string; url: string; monto?: number }[] =
        Array.isArray(values.vouchers) && values.vouchers.length > 0
          ? (values.vouchers as { nombre: string; url: string; monto?: number }[])
          : typeof patch.voucherUrl === "string" &&
              typeof patch.voucherNombre === "string"
            ? normalizarVouchers([
                { nombre: patch.voucherNombre, url: patch.voucherUrl },
              ])
            : Array.isArray(existente?.vouchers) && existente.vouchers.length > 0
              ? existente.vouchers
              : existente?.voucherUrl
                ? normalizarVouchers([
                    { nombre: existente.voucherNombre ?? "", url: existente.voucherUrl },
                  ])
                : [];

      const total = totalDelMes(
        "monto" in patch ? patch.monto : existente?.monto,
        "mantenimiento" in patch ? patch.mantenimiento : existente?.mantenimiento,
      );
      const estadoFallback =
        typeof values.estado === "string"
          ? values.estado
          : existente?.estado ?? "PENDIENTE";
      const { montoPagado, estado } = derivarPago(vouchers, total, estadoFallback);

      if ((estado === "PARCIAL" || estado === "PAGADO") && vouchers.length === 0) {
        return NextResponse.json(
          { error: "El pago solo se confirma con al menos un baucher en imagen JPEG" },
          { status: 400 }
        );
      }

      values.estado = estado;
      const tieneMontos = vouchers.some((v) => typeof v.monto === "number");
      if (tieneMontos) {
        values.montoPagado = montoPagado.toFixed(2);
      } else if ("montoPagado" in patch) {
        values.montoPagado = Math.max(0, Number(patch.montoPagado) || 0).toFixed(2);
      }

      if (vouchers.length > 0) {
        values.vouchers = vouchers;
        values.voucherUrl = vouchers[0]?.url ?? null;
        values.voucherNombre = vouchers[0]?.nombre ?? null;
      }

      if (estado === "PAGADO") {
        const fp =
          typeof patch.fechaPago === "string"
            ? patch.fechaPago
            : existente?.fechaPago
              ? toDateStr(existente.fechaPago)
              : new Date().toISOString().slice(0, 10);
        const per = existente ? toDateStr(existente.periodo) : "";
        const ind =
          "diasIndulgencia" in patch
            ? Math.max(0, Math.floor(Number(patch.diasIndulgencia) || 0))
            : Number(existente?.diasIndulgencia ?? 0);
        values.fechaPago = fp;
        values.penalidad = fp && per && fp > sumarDias(per, ind) ? "70.00" : "0";
      }
    }

    const [row] = await db
      .update(schema.payments)
      .set(values)
      .where(sql`id = ${id}`)
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "PAYMENT_UPDATED",
      module: "PAYMENTS",
      entityType: "PAYMENT",
      entityId: row.id,
      current: {
        contractId: row.contractId,
        periodo: toDateStr(row.periodo),
        estado: row.estado,
        monto: row.monto,
        penalidad: row.penalidad,
      },
    });

    return NextResponse.json({
      ...row,
      periodo: toDateStr(row.periodo),
      fechaPago: row.fechaPago ? toDateStr(row.fechaPago) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
