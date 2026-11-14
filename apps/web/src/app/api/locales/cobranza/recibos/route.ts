import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { calcularMontoPorcentual } from "@/lib/local-utility-billing";
import { DIAS_PRORROGA_POR_DEFECTO } from "@/lib/cronograma";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;

function parseAmount(value: unknown, label: string): number {
  const amount = value === undefined || value === null || value === "" ? 0 : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new Error(`${label} debe ser un monto entre 0 y ${MAX_AMOUNT}.`);
  }
  return amount;
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Los datos del recibo no son válidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const localId = typeof input.localId === "string" ? input.localId : "";
    const periodo = typeof input.periodo === "string" ? input.periodo : "";
    if (!UUID.test(localId) || !validDate(periodo)) {
      return NextResponse.json({ error: "Selecciona un local y periodo válidos." }, { status: 400 });
    }

    let reciboLuzMonto: number;
    let reciboAguaMonto: number;
    try {
      reciboLuzMonto = Number(parseAmount(input.reciboLuzMonto, "El recibo de luz"));
      reciboAguaMonto = Number(parseAmount(input.reciboAguaMonto, "El recibo de agua"));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Los montos de recibo no son válidos." },
        { status: 400 },
      );
    }
    if (reciboLuzMonto === 0 && reciboAguaMonto === 0) {
      return NextResponse.json({ error: "Ingresa el monto de al menos un recibo." }, { status: 400 });
    }

    const { db, schema } = dbModule;
    const [local] = await db.select({
      id: schema.locales.id,
      pagoLuzPorcentaje: schema.locales.pagoLuzPorcentaje,
      pagoAguaPorcentaje: schema.locales.pagoAguaPorcentaje,
    }).from(schema.locales)
      .where(eq(schema.locales.id, localId))
      .limit(1);
    if (!local) return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });

    const contracts = await db.select({
      id: schema.localContracts.id,
      localId: schema.localContracts.localId,
      montoCanon: schema.localContracts.montoCanon,
      mantenimiento: schema.localContracts.mantenimiento,
      fechaInicio: schema.localContracts.fechaInicio,
      fechaFin: schema.localContracts.fechaFin,
    }).from(schema.localContracts)
      .where(and(
        eq(schema.localContracts.localId, localId),
        inArray(schema.localContracts.estado, ["NOTARIADO_FIRMADO", "VIGENTE"]),
      ))
      .limit(2);
    if (contracts.length !== 1) {
      return NextResponse.json(
        { error: contracts.length === 0 ? "El local no tiene un contrato vigente para cobrar recibos." : "El local tiene más de un contrato vigente." },
        { status: 409 },
      );
    }
    const contract = contracts[0]!;
    if (periodo < dateOnly(contract.fechaInicio) || periodo > dateOnly(contract.fechaFin)) {
      return NextResponse.json({ error: "El periodo está fuera de las fechas del contrato." }, { status: 400 });
    }

    const porcentajeLuz = Number(local.pagoLuzPorcentaje);
    const porcentajeAgua = Number(local.pagoAguaPorcentaje);
    if (
      !Number.isFinite(porcentajeLuz) ||
      porcentajeLuz < 0 ||
      porcentajeLuz > 100 ||
      !Number.isFinite(porcentajeAgua) ||
      porcentajeAgua < 0 ||
      porcentajeAgua > 100
    ) {
      throw new Error("Los porcentajes de luz o agua del local no son válidos.");
    }
    const pagoLuz = calcularMontoPorcentual(reciboLuzMonto, porcentajeLuz);
    const pagoAgua = calcularMontoPorcentual(reciboAguaMonto, porcentajeAgua);
    const updatedAt = new Date();

    const payment = await db.transaction(async (tx) => {
      const [existing] = await tx.select()
        .from(schema.localPayments)
        .where(and(
          eq(schema.localPayments.contractId, contract.id),
          eq(schema.localPayments.periodo, periodo),
        ))
        .for("update")
        .limit(1);

      const monto = Number(existing?.monto ?? contract.montoCanon);
      const mantenimiento = Number(existing?.mantenimiento ?? contract.mantenimiento);
      const total = monto + mantenimiento + pagoLuz + pagoAgua;
      const vouchers = existing?.vouchers ?? [];
      const voucherAmount = vouchers.reduce(
        (sum, voucher) => sum + (typeof voucher.monto === "number" ? voucher.monto : 0),
        0,
      );
      const hasUnpricedVoucher = vouchers.some((voucher) => typeof voucher.monto !== "number");
      const estado = vouchers.length === 0
        ? "PENDIENTE"
        : hasUnpricedVoucher
          ? "DEPOSITADO"
          : voucherAmount + 0.001 >= total
            ? "PAGADO"
            : voucherAmount > 0
              ? "PARCIAL"
              : "PENDIENTE";
      const montoPagado = Math.max(Number(existing?.montoPagado ?? 0), voucherAmount);
      const values = {
        localId,
        contractId: contract.id,
        periodo,
        monto: existing?.monto ?? contract.montoCanon,
        mantenimiento: existing?.mantenimiento ?? contract.mantenimiento,
        reciboLuzMonto: reciboLuzMonto.toFixed(2),
        reciboAguaMonto: reciboAguaMonto.toFixed(2),
        pagoLuzPorcentaje: porcentajeLuz.toFixed(2),
        pagoAguaPorcentaje: porcentajeAgua.toFixed(2),
        pagoLuz: pagoLuz.toFixed(2),
        pagoAgua: pagoAgua.toFixed(2),
        montoPagado: montoPagado.toFixed(2),
        diasIndulgencia: existing?.diasIndulgencia ?? DIAS_PRORROGA_POR_DEFECTO,
        estado,
        fechaPago: estado === "PAGADO" ? existing?.fechaPago ?? updatedAt.toISOString().slice(0, 10) : null,
        vouchers,
        updatedAt,
      };

      if (existing) {
        const [updated] = await tx.update(schema.localPayments)
          .set(values)
          .where(eq(schema.localPayments.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(schema.localPayments)
        .values(values)
        .returning();
      return created;
    });

    if (!payment) throw new Error("No se pudo guardar el recibo del local.");
    const response = NextResponse.json({
      ...payment,
      periodo: dateOnly(payment.periodo),
      fechaPago: payment.fechaPago ? dateOnly(payment.fechaPago) : null,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[locales] register utility receipts failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron registrar los recibos de servicios." },
      { status: 500 },
    );
  }
}
