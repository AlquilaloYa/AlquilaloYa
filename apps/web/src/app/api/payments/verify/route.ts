import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { completeTotp, listVerifiedTotp } from "@/lib/mfa";
import {
  applySessionCookies,
  isNativeMobileRequest,
  readSessionTokens,
} from "@/lib/supabase-auth";

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

    const body = (await req.json().catch(() => ({}))) as {
      paymentId?: unknown;
      code?: unknown;
    };
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!paymentId || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Indica el pago y el código de 6 dígitos de tu app autenticadora" },
        { status: 400 }
      );
    }

    const { accessToken } = readSessionTokens(req);
    if (!accessToken) {
      return NextResponse.json({ error: "No hay una sesión activa" }, { status: 401 });
    }
    const factors = await listVerifiedTotp(accessToken);
    const factor = factors[0];
    if (!factor) {
      return NextResponse.json(
        {
          error: "Activa una app autenticadora en Configuración > Seguridad para verificar pagos.",
          code: "MFA_SETUP_REQUIRED",
        },
        { status: 403 }
      );
    }

    let tokens;
    try {
      tokens = await completeTotp(accessToken, factor.id, code);
    } catch {
      return NextResponse.json(
        { error: "El código de la app autenticadora no es válido o ya venció." },
        { status: 401 }
      );
    }

    const { db, schema } = dbModule;
    const verifiedAt = new Date();
    const payment = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: schema.payments.id,
          estado: schema.payments.estado,
          vouchers: schema.payments.vouchers,
          voucherUrl: schema.payments.voucherUrl,
          voucherNombre: schema.payments.voucherNombre,
        })
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .for("update");

      if (!current) throw new VerificationError("Pago no encontrado", 404);
      if (current.estado !== "PAGADO" && current.estado !== "PARCIAL") {
        throw new VerificationError("Solo se pueden verificar pagos parciales o pagados", 400);
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
      const [updated] = await tx
        .update(schema.payments)
        .set({ vouchers: verifiedVouchers })
        .where(eq(schema.payments.id, paymentId))
        .returning({
          id: schema.payments.id,
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
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
    return applySessionCookies(response, tokens, isNativeMobileRequest(req));
  } catch (error) {
    if (error instanceof VerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
