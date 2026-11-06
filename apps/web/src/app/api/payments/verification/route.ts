import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { hasPaymentVerification } from "@/lib/payment-verification-session";
import {
  canViewVerificationPayment,
  paymentVerificationAccess,
} from "@/lib/payment-verification-access";

export const dynamic = "force-dynamic";

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function normalizarPersona(value: string | null): "miguel" | "emely" | null {
  const persona = (value ?? "").trim().toLowerCase();
  if (persona.startsWith("miguel")) return "miguel";
  if (persona.startsWith("emely")) return "emely";
  return null;
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!hasPaymentVerification(req, auth.user.id)) {
      return NextResponse.json(
        { error: "Valida tu app autenticadora antes de ver los vouchers." },
        { status: 403 }
      );
    }

    const month = new URL(req.url).searchParams.get("month") ?? "";
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
      return NextResponse.json({ error: "El mes debe tener formato YYYY-MM" }, { status: 400 });
    }
    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (year < 2000 || monthNumber < 1 || monthNumber > 12) {
      return NextResponse.json({ error: "Mes no válido" }, { status: 400 });
    }

    const start = `${month}-01`;
    const nextMonth =
      monthNumber === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
    const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNumber, 1));
    const { db, schema } = dbModule;
    const rows = await db
      .select({
        id: schema.payments.id,
        contractId: schema.payments.contractId,
        periodo: schema.payments.periodo,
        fechaPago: schema.payments.fechaPago,
        createdAt: schema.payments.createdAt,
        updatedAt: schema.payments.updatedAt,
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        montoPagado: schema.payments.montoPagado,
        estado: schema.payments.estado,
        voucherNombre: schema.payments.voucherNombre,
        voucherUrl: schema.payments.voucherUrl,
        vouchers: schema.payments.vouchers,
        clienteId: schema.clients.id,
        clienteNombre: schema.clients.nombres,
        clienteApellido: schema.clients.apellidos,
        codigoContrato: schema.contracts.codigoContrato,
        departamento: schema.departments.codigo,
        personaPago: schema.departments.personaPago,
      })
      .from(schema.payments)
      .innerJoin(schema.contracts, eq(schema.contracts.id, schema.payments.contractId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .innerJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId))
      .where(
        and(
          isNull(schema.contracts.eliminadoEn),
          inArray(schema.payments.estado, ["PAGADO", "PARCIAL"]),
          or(
            and(
              gte(schema.payments.fechaPago, start),
              lt(schema.payments.fechaPago, nextMonth)
            ),
            and(
              isNull(schema.payments.fechaPago),
              gte(schema.payments.updatedAt, startDate),
              lt(schema.payments.updatedAt, endDate)
            )
          )
        )
      )
      .orderBy(schema.payments.updatedAt);

    const payments = rows.flatMap((row) => {
      if (!canViewVerificationPayment(auth.user.email, row.codigoContrato, row.departamento)) {
        return [];
      }
      const owner = normalizarPersona(row.personaPago);
      if (!owner) return [];
      const vouchers =
        row.vouchers.length > 0
          ? row.vouchers
          : row.voucherUrl && row.voucherNombre
            ? [{ nombre: row.voucherNombre, url: row.voucherUrl }]
            : [];
      if (vouchers.length === 0) return [];
      const verified = vouchers.every((voucher) => Boolean(voucher.verificadoEn));
      return [
        {
          id: row.id,
          contractId: row.contractId,
          codigoContrato: row.codigoContrato,
          clienteId: row.clienteId,
          cliente: [row.clienteNombre, row.clienteApellido].filter(Boolean).join(" "),
          departamento: row.departamento,
          responsable: owner,
          periodo: dateOnly(row.periodo),
          fechaPago: dateOnly(row.fechaPago),
          fechaRegistro: row.fechaPago
            ? `${dateOnly(row.fechaPago)}T12:00:00.000Z`
            : (row.updatedAt ?? row.createdAt).toISOString(),
          estado: row.estado,
          monto: row.monto,
          mantenimiento: row.mantenimiento,
          montoPagado: row.montoPagado,
          vouchers,
          voucherVerificadoEn: verified ? vouchers[0]?.verificadoEn ?? null : null,
          voucherVerificadoPor: verified ? vouchers[0]?.verificadoPor ?? null : null,
        },
      ];
    });

    const response = NextResponse.json({
      month,
      payments,
      access: paymentVerificationAccess(auth.user.email),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
