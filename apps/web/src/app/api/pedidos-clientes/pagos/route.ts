import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.WORK_ORDER_READ);
    if (denied) return denied;

    const schema = dbModule.schema;
    const items = await dbModule.db
      .select({
        id: schema.clientPaymentApprovalRequests.id,
        clientName: sql<string>`trim(coalesce(${schema.clients.nombres}, '') || ' ' || coalesce(${schema.clients.apellidos}, ''))`,
        departmentCode: schema.departments.codigo,
        targetType: sql<"MONTHLY" | "SERVICE">`CASE
          WHEN ${schema.clientPaymentApprovalRequests.paymentId} IS NOT NULL
          THEN 'MONTHLY'
          ELSE 'SERVICE'
        END`,
        targetTitle: sql<string>`CASE
          WHEN ${schema.clientPaymentApprovalRequests.paymentId} IS NOT NULL
            THEN 'Mensualidad + mantenimiento'
          WHEN ${schema.serviciosExtras.incluyeInternet} AND ${schema.serviciosExtras.incluyeCargaElectrica}
            THEN 'Internet + carga eléctrica'
          WHEN ${schema.serviciosExtras.incluyeInternet}
            THEN 'Internet'
          ELSE 'Carga eléctrica'
        END`,
        period: sql<string>`coalesce(${schema.payments.periodo}::text, ${schema.serviciosExtrasPagos.periodo})`,
        dueDate: schema.clientPaymentApprovalRequests.dueDate,
        requestedAmount: schema.clientPaymentApprovalRequests.requestedAmount,
        status: schema.clientPaymentApprovalRequests.status,
        reviewNote: schema.clientPaymentApprovalRequests.reviewNote,
        reviewedAt: schema.clientPaymentApprovalRequests.reviewedAt,
        createdAt: schema.clientPaymentApprovalRequests.createdAt,
      })
      .from(schema.clientPaymentApprovalRequests)
      .innerJoin(
        schema.clients,
        eq(schema.clients.id, schema.clientPaymentApprovalRequests.clientId),
      )
      .innerJoin(
        schema.contracts,
        eq(
          schema.contracts.id,
          schema.clientPaymentApprovalRequests.contractId,
        ),
      )
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId),
      )
      .leftJoin(
        schema.payments,
        eq(schema.payments.id, schema.clientPaymentApprovalRequests.paymentId),
      )
      .leftJoin(
        schema.serviciosExtrasPagos,
        eq(
          schema.serviciosExtrasPagos.id,
          schema.clientPaymentApprovalRequests.serviciosExtrasPagoId,
        ),
      )
      .leftJoin(
        schema.serviciosExtras,
        eq(schema.serviciosExtras.id, schema.serviciosExtrasPagos.servicioId),
      )
      .orderBy(desc(schema.clientPaymentApprovalRequests.createdAt))
      .limit(200);
    const response = NextResponse.json({
      items: items.map((item) => ({
        ...item,
        dueDate: String(item.dueDate).slice(0, 10),
        requestedAt: item.createdAt.toISOString(),
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
      })),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las solicitudes de pago.",
      },
      { status: 500 },
    );
  }
}
