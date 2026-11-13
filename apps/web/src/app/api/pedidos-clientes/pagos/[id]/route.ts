import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.WORK_ORDER_CREATE);
    if (denied) return denied;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de solicitud no válido." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Solicitud no válida." },
        { status: 400 },
      );
    }
    const values =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (values.action !== "approve" && values.action !== "reject") {
      return NextResponse.json(
        { error: "Selecciona aprobar o rechazar la solicitud." },
        { status: 400 },
      );
    }
    if (
      values.note !== undefined &&
      (typeof values.note !== "string" || values.note.length > 500)
    ) {
      return NextResponse.json(
        { error: "La nota no puede superar 500 caracteres." },
        { status: 400 },
      );
    }

    const now = new Date();
    const nextStatus = values.action === "approve" ? "APPROVED" : "REJECTED";
    const result = await dbModule.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: dbModule.schema.clientPaymentApprovalRequests.id,
          clientId: dbModule.schema.clientPaymentApprovalRequests.clientId,
          contractId: dbModule.schema.clientPaymentApprovalRequests.contractId,
          paymentId: dbModule.schema.clientPaymentApprovalRequests.paymentId,
          status: dbModule.schema.clientPaymentApprovalRequests.status,
          requestedAmount:
            dbModule.schema.clientPaymentApprovalRequests.requestedAmount,
        })
        .from(dbModule.schema.clientPaymentApprovalRequests)
        .where(eq(dbModule.schema.clientPaymentApprovalRequests.id, params.id))
        .for("update");
      if (!current) {
        return {
          kind: "error",
          error: "Solicitud de pago no encontrada.",
          httpStatus: 404,
        } as const;
      }
      if (current.status !== "PENDING") {
        return {
          kind: "error",
          error: "La solicitud ya fue revisada.",
          httpStatus: 409,
        } as const;
      }

      const [updated] = await tx
        .update(dbModule.schema.clientPaymentApprovalRequests)
        .set({
          status: nextStatus,
          reviewedBy: auth.user.id,
          reviewedAt: now,
          reviewNote:
            typeof values.note === "string" ? values.note.trim() || null : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(dbModule.schema.clientPaymentApprovalRequests.id, current.id),
            eq(dbModule.schema.clientPaymentApprovalRequests.status, "PENDING"),
          ),
        )
        .returning({ id: dbModule.schema.clientPaymentApprovalRequests.id });
      if (!updated) {
        return {
          kind: "error",
          error: "La solicitud ya fue revisada.",
          httpStatus: 409,
        } as const;
      }

      await tx
        .insert(dbModule.schema.clientPortalNotifications)
        .values({
          clientId: current.clientId,
          workOrderId: null,
          type:
            nextStatus === "APPROVED"
              ? "PAYMENT_APPROVAL_APPROVED"
              : "PAYMENT_APPROVAL_REJECTED",
          title:
            nextStatus === "APPROVED"
              ? "Solicitud de pago aprobada"
              : "Solicitud de pago rechazada",
          body:
            nextStatus === "APPROVED"
              ? current.paymentId
                ? "Administración aprobó el permiso. Puedes subir un voucher total o parcial hasta el saldo pendiente."
                : "Administración aprobó el pago del servicio. Ya puedes subir el voucher por el monto completo."
              : typeof values.note === "string" && values.note.trim()
                ? `El ERP rechazó tu solicitud: ${values.note.trim()}`
                : "El ERP rechazó tu solicitud. Comunícate con administración para más información.",
          dedupeKey: `payment-approval-${nextStatus.toLowerCase()}:${current.id}`,
        })
        .onConflictDoNothing();
      return {
        kind: "success",
        request: current,
        status: nextStatus,
      } as const;
    });

    if (result.kind === "error") {
      return NextResponse.json(
        { error: result.error },
        { status: result.httpStatus },
      );
    }
    await recordAdminAction(dbModule, auth.user, {
      action:
        result.status === "APPROVED"
          ? "CLIENT_PAYMENT_APPROVAL_APPROVED"
          : "CLIENT_PAYMENT_APPROVAL_REJECTED",
      module: "PAYMENTS",
      entityType: "CLIENT_PAYMENT_APPROVAL",
      entityId: result.request.id,
      current: {
        clientId: result.request.clientId,
        contractId: result.request.contractId,
        requestedAmount: result.request.requestedAmount,
      },
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la solicitud de pago.",
      },
      { status: 500 },
    );
  }
}
