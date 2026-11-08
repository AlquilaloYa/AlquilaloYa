import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { DIAS_PRORROGA_POR_DEFECTO } from "@/lib/cronograma";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Voucher = { nombre: string; url: string; monto?: number };

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function normalizarVouchers(input: unknown): Voucher[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.nombre !== "string" ||
      !/\.jpe?g$/i.test(row.nombre) ||
      typeof row.url !== "string" ||
      !row.url.startsWith("data:image/jpeg")
    ) return [];
    const monto = Number(row.monto);
    return [{
      nombre: row.nombre,
      url: row.url,
      ...(Number.isFinite(monto) && monto >= 0 ? { monto } : {}),
    }];
  });
}

function montoValido(value: unknown): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000_000;
}

function derivarPago(vouchers: Voucher[], total: number, fallback: string) {
  const values = vouchers.filter((voucher) => typeof voucher.monto === "number");
  if (values.length === 0) return { montoPagado: 0, estado: fallback };
  const montoPagado = values.reduce((sum, voucher) => sum + Number(voucher.monto ?? 0), 0);
  return {
    montoPagado,
    estado: montoPagado <= 0 ? "PENDIENTE" : montoPagado + 0.001 >= total ? "PAGADO" : "PARCIAL",
  };
}

function sumarDias(iso: string, dias: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + dias));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const paymentId = new URL(request.url).searchParams.get("paymentId");
    if (!paymentId || !UUID.test(paymentId)) {
      return NextResponse.json({ error: "Indica un pago válido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const [payment] = await dbModule.db.select()
      .from(dbModule.schema.localPayments)
      .where(eq(dbModule.schema.localPayments.id, paymentId))
      .limit(1);
    if (!payment) return NextResponse.json({ error: "Pago no encontrado." }, { status: 404 });
    const response = NextResponse.json({
      ...payment,
      periodo: dateOnly(payment.periodo),
      fechaPago: dateOnly(payment.fechaPago),
      voucherVerificadoEn: payment.voucherVerificadoEn?.toISOString() ?? null,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[locales] load collection payment failed", error);
    return NextResponse.json({ error: "No se pudo cargar el pago." }, { status: 500 });
  }
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
      return NextResponse.json({ error: "Los datos del pago no son válidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const contractId = typeof input.contractId === "string" ? input.contractId : "";
    const periodo = typeof input.periodo === "string" ? input.periodo.slice(0, 10) : "";
    if (!UUID.test(contractId) || !/^\d{4}-\d{2}-\d{2}$/.test(periodo) || Number.isNaN(Date.parse(`${periodo}T00:00:00Z`))) {
      return NextResponse.json({ error: "Contrato y periodo son requeridos." }, { status: 400 });
    }
    const { db, schema } = dbModule;
    const [contract] = await db.select({
      id: schema.localContracts.id,
      localId: schema.localContracts.localId,
      montoCanon: schema.localContracts.montoCanon,
      mantenimiento: schema.localContracts.mantenimiento,
    }).from(schema.localContracts)
      .where(eq(schema.localContracts.id, contractId)).limit(1);
    if (!contract) return NextResponse.json({ error: "Contrato local no encontrado." }, { status: 404 });

    const [existing] = await db.select({
      diasIndulgencia: schema.localPayments.diasIndulgencia,
    }).from(schema.localPayments)
      .where(and(
        eq(schema.localPayments.contractId, contractId),
        eq(schema.localPayments.periodo, periodo),
      )).limit(1);
    const vouchers = normalizarVouchers(input.vouchers);
    const monto = input.monto ?? contract.montoCanon;
    const mantenimiento = input.mantenimiento ?? contract.mantenimiento;
    if (!montoValido(monto) || !montoValido(mantenimiento)) {
      return NextResponse.json({ error: "El canon y mantenimiento deben ser montos válidos." }, { status: 400 });
    }
    const indulgenciaRaw = input.diasIndulgencia ?? existing?.diasIndulgencia ?? DIAS_PRORROGA_POR_DEFECTO;
    const diasIndulgencia = Number.isFinite(Number(indulgenciaRaw))
      ? Math.max(0, Math.floor(Number(indulgenciaRaw)))
      : DIAS_PRORROGA_POR_DEFECTO;
    const { montoPagado, estado } = derivarPago(
      vouchers,
      Number(monto) + Number(mantenimiento),
      typeof input.estado === "string" ? input.estado : "PENDIENTE",
    );
    if ((estado === "PARCIAL" || estado === "PAGADO") && vouchers.length === 0) {
      return NextResponse.json({ error: "El pago requiere al menos un voucher JPEG." }, { status: 400 });
    }
    const fechaPago = estado === "PAGADO"
      ? typeof input.fechaPago === "string" ? input.fechaPago.slice(0, 10) : new Date().toISOString().slice(0, 10)
      : null;
    const penalidad = estado === "PAGADO" && fechaPago && fechaPago > sumarDias(periodo, diasIndulgencia)
      ? "70.00"
      : "0.00";
    const [row] = await db.insert(schema.localPayments)
      .values({
        localId: contract.localId,
        contractId,
        periodo,
        monto: String(monto),
        mantenimiento: String(mantenimiento),
        penalidad,
        montoPagado: montoPagado.toFixed(2),
        diasIndulgencia,
        estado,
        fechaPago,
        vouchers,
      })
      .onConflictDoUpdate({
        target: [schema.localPayments.contractId, schema.localPayments.periodo],
        set: {
          monto: String(monto),
          mantenimiento: String(mantenimiento),
          penalidad,
          montoPagado: montoPagado.toFixed(2),
          diasIndulgencia,
          estado,
          fechaPago,
          vouchers,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
    return NextResponse.json({
      ...row,
      periodo: dateOnly(row.periodo),
      fechaPago: dateOnly(row.fechaPago),
      voucherVerificadoEn: row.voucherVerificadoEn?.toISOString() ?? null,
    }, { status: 201 });
  } catch (error) {
    console.error("[locales] register collection payment failed", error);
    return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Los datos del pago no son válidos." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id : "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Indica un pago válido." }, { status: 400 });
    const { db, schema } = dbModule;
    const [current] = await db.select()
      .from(schema.localPayments)
      .where(eq(schema.localPayments.id, id)).limit(1);
    if (!current) return NextResponse.json({ error: "Pago no encontrado." }, { status: 404 });

    const values: Partial<typeof schema.localPayments.$inferInsert> = { updatedAt: new Date() };
    if ("diasIndulgencia" in input) {
      const days = Number(input.diasIndulgencia);
      if (!Number.isFinite(days) || days < 0 || days > 365) {
        return NextResponse.json({ error: "Los días de prórroga deben estar entre 0 y 365." }, { status: 400 });
      }
      values.diasIndulgencia = Math.floor(days);
    }
    if ("vouchers" in input) {
      const vouchers = normalizarVouchers(input.vouchers);
      const monto = input.monto ?? current.monto;
      const mantenimiento = input.mantenimiento ?? current.mantenimiento;
      if (!montoValido(monto) || !montoValido(mantenimiento)) {
        return NextResponse.json({ error: "El canon y mantenimiento deben ser montos válidos." }, { status: 400 });
      }
      const payment = derivarPago(vouchers, Number(monto) + Number(mantenimiento), current.estado);
      if ((payment.estado === "PARCIAL" || payment.estado === "PAGADO") && vouchers.length === 0) {
        return NextResponse.json({ error: "El pago requiere al menos un voucher JPEG." }, { status: 400 });
      }
      const days = values.diasIndulgencia ?? current.diasIndulgencia;
      const fechaPago = payment.estado === "PAGADO" ? new Date().toISOString().slice(0, 10) : null;
      values.vouchers = vouchers;
      values.monto = String(monto);
      values.mantenimiento = String(mantenimiento);
      values.montoPagado = payment.montoPagado.toFixed(2);
      values.estado = payment.estado;
      values.fechaPago = fechaPago;
      values.penalidad = fechaPago && fechaPago > sumarDias(dateOnly(current.periodo)!, days) ? "70.00" : "0.00";
      values.voucherVerificadoEn = null;
      values.voucherVerificadoPor = null;
    }
    const [updated] = await db.update(schema.localPayments)
      .set(values)
      .where(eq(schema.localPayments.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "No se pudo actualizar el pago." }, { status: 500 });
    return NextResponse.json({
      ...updated,
      periodo: dateOnly(updated.periodo),
      fechaPago: dateOnly(updated.fechaPago),
      voucherVerificadoEn: updated.voucherVerificadoEn?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[locales] update collection payment failed", error);
    return NextResponse.json({ error: "No se pudo actualizar el pago." }, { status: 500 });
  }
}
