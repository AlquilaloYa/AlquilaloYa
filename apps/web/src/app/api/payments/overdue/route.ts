import { NextResponse } from "next/server";
import { and, eq, isNull, lt, notInArray } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import {
  addDaysToDate,
  daysBetweenDates,
  isPaymentDue,
  monthlyDueDate,
  todayInLima,
} from "@/lib/payment-overdue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const today = todayInLima();
    const currentMonth = today.slice(0, 7);
    const nextMonthDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
    const nextMonth = nextMonthDate.toISOString().slice(0, 10);
    const { db, schema } = dbModule;
    const [contracts, payments] = await Promise.all([
      db
        .select({
          id: schema.contracts.id,
          codigoContrato: schema.contracts.codigoContrato,
          fechaInicio: schema.contracts.fechaInicio,
          fechaFin: schema.contracts.fechaFin,
          estado: schema.contracts.estado,
          clienteNombre: schema.clients.nombres,
          clienteApellido: schema.clients.apellidos,
        })
        .from(schema.contracts)
        .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
        .where(
          and(
            isNull(schema.contracts.eliminadoEn),
            notInArray(schema.contracts.estado, ["CANCELADO", "RESUELTO"]),
          ),
        ),
      db
        .select({
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
          estado: schema.payments.estado,
          diasIndulgencia: schema.payments.diasIndulgencia,
          voucherNombre: schema.payments.voucherNombre,
          voucherUrl: schema.payments.voucherUrl,
          vouchers: schema.payments.vouchers,
        })
        .from(schema.payments)
        .where(
          and(
            lt(schema.payments.periodo, nextMonth),
            isNull(schema.payments.eliminadoEn),
          ),
        ),
    ]);

    const paymentsByContractPeriod = new Map(
      payments.map((payment) => [
        `${payment.contractId}:${String(payment.periodo).slice(0, 10)}`,
        payment,
      ]),
    );
    const overdue = contracts.flatMap((contract) => {
      const startDate = String(contract.fechaInicio).slice(0, 10);
      const endDate = String(contract.fechaFin).slice(0, 10);
      const [startYear, startMonth] = startDate.split("-").map(Number);
      const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
      const startMonthIndex = startYear! * 12 + startMonth! - 1;
      const currentMonthIndex = currentYear! * 12 + currentMonthNumber! - 1;
      const results = [];

      for (let monthIndex = startMonthIndex; monthIndex <= currentMonthIndex; monthIndex++) {
        const year = Math.floor(monthIndex / 12);
        const monthNumber = (monthIndex % 12) + 1;
        const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
        const dueDate = monthlyDueDate(startDate, month);
        if (dueDate >= endDate) continue;

        const payment = paymentsByContractPeriod.get(`${contract.id}:${dueDate}`);
        const extensionDays = Math.max(
          0,
          Math.floor(Number(payment?.diasIndulgencia ?? 0) || 0),
        );
        const effectiveDueDate = addDaysToDate(dueDate, extensionDays);
        if (!isPaymentDue(effectiveDueDate, today)) continue;

        const hasVoucher =
          Boolean(payment?.voucherNombre && payment?.voucherUrl) ||
          (payment?.vouchers?.length ?? 0) > 0;
        if (hasVoucher || payment?.estado === "PAGADO") continue;

        results.push({
          id: `${contract.id}:${dueDate}`,
          contractId: contract.id,
          codigoContrato: contract.codigoContrato,
          cliente: [contract.clienteNombre, contract.clienteApellido]
            .filter(Boolean)
            .join(" ") || "Cliente sin nombre",
          periodo: dueDate,
          diasAtraso: daysBetweenDates(effectiveDueDate, today),
        });
      }

      return results;
    });

    const response = NextResponse.json({ overdue });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron consultar los pagos vencidos." },
      { status: 500 },
    );
  }
}
