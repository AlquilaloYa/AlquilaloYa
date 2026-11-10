import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { hasPaymentVerification } from "@/lib/payment-verification-session";
import { canVerifyPayment } from "@/lib/payment-verification-access";
import { addDaysToDate } from "@/lib/payment-overdue";
import { settleVerifiedPayment } from "@/lib/payment-settlement";

export const dynamic = "force-dynamic";

class VerificationError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!hasPaymentVerification(req, auth.user.id)) {
      return NextResponse.json(
        { error: "La autorización venció. Cierra y vuelve a abrir la verificación de pagos." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      paymentId?: unknown;
    };
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
    if (!paymentId) {
      return NextResponse.json(
        { error: "Indica el pago que deseas verificar." },
        { status: 400 }
      );
    }

    const { db, schema } = dbModule;
    const verifiedAt = new Date();
    const payment = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: schema.payments.id,
          contractId: schema.payments.contractId,
          estado: schema.payments.estado,
          periodo: schema.payments.periodo,
          fechaPago: schema.payments.fechaPago,
          monto: schema.payments.monto,
          mantenimiento: schema.payments.mantenimiento,
          montoPagado: schema.payments.montoPagado,
          diasIndulgencia: schema.payments.diasIndulgencia,
          penalidad: schema.payments.penalidad,
          vouchers: schema.payments.vouchers,
          voucherUrl: schema.payments.voucherUrl,
          voucherNombre: schema.payments.voucherNombre,
        })
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .for("update");

      if (!current) throw new VerificationError("Pago no encontrado", 404);
      const [contract] = await tx
        .select({ codigoContrato: schema.contracts.codigoContrato })
        .from(schema.contracts)
        .where(eq(schema.contracts.id, current.contractId))
        .limit(1);
      if (!contract) throw new VerificationError("Contrato no encontrado", 404);
      if (!canVerifyPayment(auth.user.email, contract.codigoContrato)) {
        throw new VerificationError(
          "No tienes permiso para verificar pagos de este contrato.",
          403,
        );
      }
      if (
        current.estado !== "DEPOSITADO" &&
        current.estado !== "PAGADO" &&
        current.estado !== "PARCIAL"
      ) {
        throw new VerificationError("Solo se pueden verificar vouchers depositados", 400);
      }
      const vouchers =
        current.vouchers.length > 0
          ? current.vouchers
          : current.voucherUrl && current.voucherNombre
            ? [{ nombre: current.voucherNombre, url: current.voucherUrl }]
            : [];
      if (vouchers.length === 0) {
        throw new VerificationError("El pago no tiene un voucher para verificar", 400);
      }
      if (vouchers.every((voucher) => Boolean(voucher.verificadoEn))) {
        throw new VerificationError("Este pago ya fue verificado", 409);
      }

      const verifiedVouchers = vouchers.map((voucher) => ({
        ...voucher,
        verificadoEn: verifiedAt.toISOString(),
        verificadoPor: auth.user.name,
      }));
      const total = Number(current.monto) + Number(current.mantenimiento);
      const settlement = settleVerifiedPayment(
        vouchers,
        total,
        Number(current.montoPagado),
      );
      const fechaPago =
        current.fechaPago ?? verifiedAt.toISOString().slice(0, 10);
      const periodo = current.periodo.slice(0, 10);
      const fechaPenalidad =
        fechaPago > addDaysToDate(periodo, current.diasIndulgencia)
          ? "70.00"
          : "0.00";
      const [updated] = await tx
        .update(schema.payments)
        .set({
          vouchers: verifiedVouchers,
          estado: settlement.estado,
          montoPagado: settlement.montoPagado.toFixed(2),
          fechaPago,
          penalidad: fechaPenalidad,
        })
        .where(eq(schema.payments.id, paymentId))
        .returning({
          id: schema.payments.id,
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
          estado: schema.payments.estado,
          montoPagado: schema.payments.montoPagado,
        });
      if (!updated) throw new Error("No se pudo guardar la verificación del voucher");
      return updated;
    });

    await recordAdminAction(dbModule, auth.user, {
      action: "PAYMENT_VOUCHER_VERIFIED",
      module: "PAYMENTS",
      entityType: "PAYMENT",
      entityId: payment.id,
      current: {
        contractId: payment.contractId,
        periodo: payment.periodo,
        estado: payment.estado,
        montoPagado: payment.montoPagado,
        voucherVerificadoEn: verifiedAt.toISOString(),
      },
    });

    const response = NextResponse.json({
      ok: true,
      paymentId: payment.id,
      estado: payment.estado,
      montoPagado: payment.montoPagado,
      voucherVerificadoEn: verifiedAt.toISOString(),
      voucherVerificadoPor: auth.user.name,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof VerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
