import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { hasPaymentVerification } from "@/lib/payment-verification-session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class VerificationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!hasPaymentVerification(request, auth.user.id)) {
      return NextResponse.json({ error: "La autorización venció. Vuelve a abrir la verificación de pagos." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const paymentId = body && typeof body.paymentId === "string" ? body.paymentId : "";
    if (!UUID.test(paymentId)) {
      return NextResponse.json({ error: "Indica el pago que deseas verificar." }, { status: 400 });
    }

    const { db, schema } = dbModule;
    const verifiedAt = new Date();
    const payment = await db.transaction(async (tx) => {
      const [current] = await tx.select({
        id: schema.localPayments.id,
        contractId: schema.localPayments.contractId,
        estado: schema.localPayments.estado,
        vouchers: schema.localPayments.vouchers,
      }).from(schema.localPayments)
        .where(eq(schema.localPayments.id, paymentId))
        .for("update");
      if (!current) throw new VerificationError("Pago no encontrado.", 404);
      if (current.estado !== "PAGADO" && current.estado !== "PARCIAL") {
        throw new VerificationError("Solo se pueden verificar pagos parciales o pagados.", 400);
      }
      if (!Array.isArray(current.vouchers) || current.vouchers.length === 0) {
        throw new VerificationError("El pago no tiene vouchers para verificar.", 400);
      }
      if (current.vouchers.every((voucher) => Boolean(voucher.verificadoEn))) {
        throw new VerificationError("Este pago ya fue verificado.", 409);
      }
      const vouchers = current.vouchers.map((voucher) => ({
        ...voucher,
        verificadoEn: verifiedAt.toISOString(),
        verificadoPor: auth.user.name,
      }));
      const [updated] = await tx.update(schema.localPayments)
        .set({
          vouchers,
          voucherVerificadoEn: verifiedAt,
          voucherVerificadoPor: auth.user.name,
          updatedAt: verifiedAt,
        })
        .where(eq(schema.localPayments.id, paymentId))
        .returning({
          id: schema.localPayments.id,
          contractId: schema.localPayments.contractId,
          periodo: schema.localPayments.periodo,
        });
      if (!updated) throw new Error("No se pudo guardar la verificación del voucher.");
      return updated;
    });

    await recordAdminAction(dbModule, auth.user, {
      action: "LOCAL_PAYMENT_VOUCHER_VERIFIED",
      module: "LOCALES",
      entityType: "LOCAL_PAYMENT",
      entityId: payment.id,
      current: {
        contractId: payment.contractId,
        periodo: payment.periodo,
        voucherVerificadoEn: verifiedAt.toISOString(),
      },
    });
    const response = NextResponse.json({
      ok: true,
      paymentId: payment.id,
      voucherVerificadoEn: verifiedAt.toISOString(),
      voucherVerificadoPor: auth.user.name,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof VerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[locales] verify collection payment failed", error);
    return NextResponse.json({ error: "No se pudo verificar el voucher." }, { status: 500 });
  }
}
