import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const localId = new URL(request.url).searchParams.get("localId");
    if (!localId || !UUID.test(localId)) {
      return NextResponse.json({ error: "Selecciona un local válido." }, { status: 400 });
    }

    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const [local] = await db.select({
      id: schema.locales.id,
      codigo: schema.locales.codigo,
      nombre: schema.locales.nombre,
    }).from(schema.locales)
      .where(eq(schema.locales.id, localId))
      .limit(1);
    if (!local) return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });

    const contracts = await db.select({
      id: schema.localContracts.id,
      codigoContrato: schema.localContracts.codigo,
      clienteId: schema.localContacts.id,
      clienteNombre: schema.localContacts.nombres,
      apellidoCliente: schema.localContacts.apellidos,
      departamentoNombre: schema.locales.codigo,
      localId: schema.localContracts.localId,
      montoCanonMensual: schema.localContracts.montoCanon,
      mantenimiento: schema.localContracts.mantenimiento,
      fechaInicio: schema.localContracts.fechaInicio,
      fechaFin: schema.localContracts.fechaFin,
      estado: schema.localContracts.estado,
    }).from(schema.localContracts)
      .innerJoin(schema.localContacts, eq(schema.localContacts.id, schema.localContracts.contactId))
      .innerJoin(schema.locales, eq(schema.locales.id, schema.localContracts.localId))
      .where(and(
        eq(schema.localContracts.localId, localId),
        inArray(schema.localContracts.estado, ["NOTARIADO_FIRMADO", "VIGENTE"]),
      ))
      .orderBy(asc(schema.localContracts.fechaInicio));

    if (contracts.length === 0) {
      return NextResponse.json({ local, contracts: [], payments: [] });
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const payments = await db.select({
      id: schema.localPayments.id,
      contractId: schema.localPayments.contractId,
      periodo: schema.localPayments.periodo,
      monto: schema.localPayments.monto,
      mantenimiento: schema.localPayments.mantenimiento,
      penalidad: schema.localPayments.penalidad,
      montoPagado: schema.localPayments.montoPagado,
      diasIndulgencia: schema.localPayments.diasIndulgencia,
      estado: schema.localPayments.estado,
      fechaPago: schema.localPayments.fechaPago,
      voucherVerificadoEn: schema.localPayments.voucherVerificadoEn,
      voucherVerificadoPor: schema.localPayments.voucherVerificadoPor,
    }).from(schema.localPayments)
      .where(and(
        eq(schema.localPayments.localId, localId),
        gte(schema.localPayments.periodo, monthStart.toISOString().slice(0, 10)),
        lt(schema.localPayments.periodo, nextMonth.toISOString().slice(0, 10)),
      ));

    const response = NextResponse.json({
      local,
      contracts: contracts.map((contract) => ({
        ...contract,
        codigoContrato: contract.codigoContrato,
        fechaInicio: dateOnly(contract.fechaInicio),
        fechaFin: dateOnly(contract.fechaFin),
        personaPago: null,
      })),
      payments: payments.map((payment) => ({
        ...payment,
        periodo: dateOnly(payment.periodo),
        fechaPago: payment.fechaPago ? dateOnly(payment.fechaPago) : null,
        voucherVerificadoEn: payment.voucherVerificadoEn?.toISOString() ?? null,
        vouchers: [],
      })),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[locales] load collection failed", error);
    return NextResponse.json({ error: "No se pudo cargar Cobranza Locales." }, { status: 500 });
  }
}
