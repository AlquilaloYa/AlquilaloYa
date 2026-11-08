import { NextResponse } from "next/server";
import { and, eq, gte, inArray, lt, or, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { hasPaymentVerification } from "@/lib/payment-verification-session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const localId = url.searchParams.get("localId") ?? "";
    const month = url.searchParams.get("month") ?? "";
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
    if (!UUID.test(localId) || !monthMatch) {
      return NextResponse.json({ error: "Indica un local y mes válidos." }, { status: 400 });
    }
    const year = Number(monthMatch[1]);
    const monthNumber = Number(monthMatch[2]);
    if (year < 2000 || monthNumber < 1 || monthNumber > 12) {
      return NextResponse.json({ error: "Mes no válido." }, { status: 400 });
    }

    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!hasPaymentVerification(request, auth.user.id)) {
      return NextResponse.json({ error: "Valida tu app autenticadora antes de ver los vouchers." }, { status: 403 });
    }

    const start = `${month}-01`;
    const nextMonth = monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
    const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNumber, 1));
    const { db, schema } = dbModule;
    const rows = await db.select({
      id: schema.localPayments.id,
      contractId: schema.localPayments.contractId,
      periodo: schema.localPayments.periodo,
      fechaPago: schema.localPayments.fechaPago,
      updatedAt: schema.localPayments.updatedAt,
      createdAt: schema.localPayments.createdAt,
      monto: schema.localPayments.monto,
      mantenimiento: schema.localPayments.mantenimiento,
      montoPagado: schema.localPayments.montoPagado,
      estado: schema.localPayments.estado,
      vouchers: schema.localPayments.vouchers,
      clienteId: schema.localContacts.id,
      clienteNombre: schema.localContacts.nombres,
      clienteApellido: schema.localContacts.apellidos,
      codigoContrato: schema.localContracts.codigo,
      localCodigo: schema.locales.codigo,
    }).from(schema.localPayments)
      .innerJoin(schema.localContracts, eq(schema.localContracts.id, schema.localPayments.contractId))
      .innerJoin(schema.localContacts, eq(schema.localContacts.id, schema.localContracts.contactId))
      .innerJoin(schema.locales, eq(schema.locales.id, schema.localPayments.localId))
      .where(and(
        eq(schema.localPayments.localId, localId),
        inArray(schema.localPayments.estado, ["PAGADO", "PARCIAL"]),
        or(
          and(gte(schema.localPayments.fechaPago, start), lt(schema.localPayments.fechaPago, nextMonth)),
          and(
            isNull(schema.localPayments.fechaPago),
            gte(schema.localPayments.updatedAt, startDate),
            lt(schema.localPayments.updatedAt, endDate),
          ),
        ),
      ))
      .orderBy(schema.localPayments.updatedAt);

    const payments = rows.flatMap((row) => {
      if (!Array.isArray(row.vouchers) || row.vouchers.length === 0) return [];
      const verified = row.vouchers.every((voucher) => Boolean(voucher.verificadoEn));
      const vouchers = row.vouchers.map((voucher) => ({
        nombre: voucher.nombre,
        url: voucher.url,
        ...(typeof voucher.monto === "number" ? { monto: voucher.monto } : {}),
        ...(voucher.verificadoEn ? { verificadoEn: voucher.verificadoEn } : {}),
        ...(voucher.verificadoPor ? { verificadoPor: voucher.verificadoPor } : {}),
      }));
      return [{
        id: row.id,
        contractId: row.contractId,
        codigoContrato: row.codigoContrato,
        clienteId: row.clienteId,
        cliente: [row.clienteNombre, row.clienteApellido].filter(Boolean).join(" "),
        departamento: row.localCodigo,
        responsable: "miguel" as const,
        periodo: dateOnly(row.periodo),
        fechaPago: dateOnly(row.fechaPago),
        fechaRegistro: row.fechaPago
          ? `${dateOnly(row.fechaPago)}T12:00:00.000Z`
          : row.updatedAt.toISOString(),
        estado: row.estado as "PAGADO" | "PARCIAL",
        monto: row.monto,
        mantenimiento: row.mantenimiento,
        montoPagado: row.montoPagado,
        vouchers,
        voucherVerificadoEn: verified ? row.vouchers[0]?.verificadoEn ?? null : null,
        voucherVerificadoPor: verified ? row.vouchers[0]?.verificadoPor ?? null : null,
      }];
    });

    const response = NextResponse.json({
      month,
      payments,
      access: { scope: null, verifyPrefix: null },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[locales] load collection verification failed", error);
    return NextResponse.json({ error: "No se pudieron cargar los pagos para verificar." }, { status: 500 });
  }
}
