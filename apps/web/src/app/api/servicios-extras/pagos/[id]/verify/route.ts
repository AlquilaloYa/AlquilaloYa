import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { hasServiciosVerification } from "@/lib/payment-verification-session";
import { canVerifyPayment } from "@/lib/payment-verification-access";

export const dynamic = "force-dynamic";

class VerificationError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!hasServiciosVerification(req, auth.user.id)) {
      return NextResponse.json(
        { error: "La autorización venció. Cierra y vuelve a abrir la verificación de vouchers." },
        { status: 403 }
      );
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const verifiedAt = new Date();
    const pago = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: schema.serviciosExtrasPagos.id,
          servicioId: schema.serviciosExtrasPagos.servicioId,
          periodo: schema.serviciosExtrasPagos.periodo,
          voucherStorageKey: schema.serviciosExtrasPagos.voucherStorageKey,
          voucherVerificadoEn: schema.serviciosExtrasPagos.voucherVerificadoEn,
        })
        .from(schema.serviciosExtrasPagos)
        .where(eq(schema.serviciosExtrasPagos.id, id))
        .for("update");

      if (!current) throw new VerificationError("Pago mensual no encontrado", 404);
      if (current.voucherVerificadoEn) {
        throw new VerificationError("Este voucher ya fue verificado", 409);
      }
      if (!current.voucherStorageKey) {
        throw new VerificationError(
          "El pago no tiene un voucher para verificar",
          400,
        );
      }

      const [servicio] = await tx
        .select({
          id: schema.serviciosExtras.id,
          codigoContrato: schema.serviciosExtras.codigoContrato,
          voucherStorageKey: schema.serviciosExtras.voucherStorageKey,
        })
        .from(schema.serviciosExtras)
        .where(eq(schema.serviciosExtras.id, current.servicioId))
        .limit(1);
      if (!servicio) throw new VerificationError("Servicio extra no encontrado", 404);
      if (!canVerifyPayment(auth.user.email, servicio.codigoContrato ?? "")) {
        throw new VerificationError(
          "No tienes permiso para verificar vouchers de este contrato.",
          403,
        );
      }

      const [updated] = await tx
        .update(schema.serviciosExtrasPagos)
        .set({
          voucherVerificadoEn: verifiedAt,
          voucherVerificadoPor: auth.user.name,
          updatedAt: verifiedAt,
        })
        .where(eq(schema.serviciosExtrasPagos.id, id))
        .returning({
          id: schema.serviciosExtrasPagos.id,
          servicioId: schema.serviciosExtrasPagos.servicioId,
          periodo: schema.serviciosExtrasPagos.periodo,
          voucherVerificadoEn: schema.serviciosExtrasPagos.voucherVerificadoEn,
        });
      if (!updated) throw new Error("No se pudo guardar la verificación del voucher");

      // Legado: si el registro original tiene el mismo voucher (backfill de la
      // migración), sincroniza su verificación para que la vista histórica no
      // quede desalineada.
      if (servicio.voucherStorageKey === current.voucherStorageKey) {
        await tx
          .update(schema.serviciosExtras)
          .set({
            estado: "PAGADO",
            voucherVerificadoEn: verifiedAt,
            voucherVerificadoPor: auth.user.name,
            updatedAt: verifiedAt,
          })
          .where(eq(schema.serviciosExtras.id, servicio.id));
      }

      return { ...updated, codigoContrato: servicio.codigoContrato };
    });

    await recordAdminAction(dbModule, auth.user, {
      action: "SERVICIOS_EXTRAS_PAGO_VERIFIED",
      module: "CONTRACTS",
      entityType: "SERVICIOS_EXTRAS_PAGOS",
      entityId: pago.id,
      current: {
        servicioId: pago.servicioId,
        periodo: pago.periodo,
        codigoContrato: pago.codigoContrato,
        voucherVerificadoEn: verifiedAt.toISOString(),
      },
    });

    const response = NextResponse.json({
      ok: true,
      id: pago.id,
      periodo: pago.periodo,
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
