import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  findCurrentClientContract,
  peruDateString,
  resolveClientPortalIdentity,
} from "@/lib/client-portal-auth";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }

    const currentContract = await findCurrentClientContract(
      dbModule,
      session.identity.client.id,
      session.identity.client.departmentCode,
    );
    if (!currentContract) {
      const response = NextResponse.json({ contract: null, payment: null, services: [] });
      response.headers.set("Cache-Control", "no-store");
      return addSessionCookiesIfRefreshed(response, session);
    }

    const { db, schema } = dbModule;
    const [contract] = await db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        montoCanonMensual: schema.contracts.montoCanonMensual,
        mantenimiento: schema.contracts.mantenimiento,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .where(and(eq(schema.contracts.id, currentContract.id), isNull(schema.contracts.eliminadoEn)))
      .limit(1);

    if (!contract) {
      const response = NextResponse.json({ contract: null, payment: null, services: [] });
      response.headers.set("Cache-Control", "no-store");
      return addSessionCookiesIfRefreshed(response, session);
    }

    const today = peruDateString();
    const todayDate = parseLocalDate(today);
    const startDate = parseLocalDate(String(contract.fechaInicio));
    const periodIndex =
      (todayDate.getFullYear() - startDate.getFullYear()) * 12 +
      todayDate.getMonth() -
      startDate.getMonth();
    const periodDate = addMonths(startDate, periodIndex);
    const period = localDateStr(periodDate);
    const periodIsActive = period < String(contract.fechaFin);

    const [paymentRows, serviceRows] = await Promise.all([
      periodIsActive
        ? db
            .select({
              monto: schema.payments.monto,
              mantenimiento: schema.payments.mantenimiento,
              montoPagado: schema.payments.montoPagado,
              estado: schema.payments.estado,
            })
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.contractId, contract.id),
                eq(schema.payments.periodo, period),
                isNull(schema.payments.eliminadoEn),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      db
        .select({
          incluyeInternet: schema.serviciosExtras.incluyeInternet,
          incluyeCargaElectrica: schema.serviciosExtras.incluyeCargaElectrica,
          montoInternet: schema.serviciosExtras.montoInternet,
          montoCargaElectrica: schema.serviciosExtras.montoCargaElectrica,
        })
        .from(schema.serviciosExtras)
        .where(eq(schema.serviciosExtras.contractId, contract.id))
        .orderBy(desc(schema.serviciosExtras.createdAt))
        .limit(1),
    ]);

    const savedPayment = paymentRows[0];
    const canon = Number(contract.montoCanonMensual ?? 0);
    const maintenance = Number(contract.mantenimiento ?? 50);
    const monthlyCanon = savedPayment && Number(savedPayment.monto) > 0
      ? Number(savedPayment.monto)
      : canon;
    const monthlyMaintenance = savedPayment && Number(savedPayment.monto) > 0
      ? Number(savedPayment.mantenimiento ?? 0)
      : maintenance;
    const monthlyTotal = monthlyCanon + monthlyMaintenance;
    const amountPaid = Math.max(0, Number(savedPayment?.montoPagado ?? 0));
    const balance = Math.max(0, monthlyTotal - amountPaid);
    const monthlyStatus =
      savedPayment?.estado === "PAGADO" || amountPaid >= monthlyTotal
        ? "PAGADO"
        : amountPaid > 0
          ? "PARCIAL"
          : period < today
            ? "VENCIDO"
            : "PENDIENTE";
    const service = serviceRows[0];

    const response = NextResponse.json({
      contract: {
        code: contract.codigoContrato,
        period: periodIsActive ? period : null,
      },
      payment: periodIsActive
        ? {
            canon: monthlyCanon,
            maintenance: monthlyMaintenance,
            total: monthlyTotal,
            amountPaid,
            balance,
            status: monthlyStatus,
          }
        : null,
      services: service
        ? [
            ...(service.incluyeInternet
              ? [{ type: "INTERNET", amount: Number(service.montoInternet ?? 0) }]
              : []),
            ...(service.incluyeCargaElectrica
              ? [{ type: "CARGA_ELECTRICA", amount: Number(service.montoCargaElectrica ?? 0) }]
              : []),
          ]
        : [],
    });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json(
      { error: "No fue posible consultar los pagos" },
      { status: 503 },
    );
  }
}
