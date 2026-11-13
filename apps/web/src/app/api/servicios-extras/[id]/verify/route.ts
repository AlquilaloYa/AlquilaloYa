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
    const servicio = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: schema.serviciosExtras.id,
          contractId: schema.serviciosExtras.contractId,
          codigoContrato: schema.serviciosExtras.codigoContrato,
          estado: schema.serviciosExtras.estado,
          fechaPago: schema.serviciosExtras.fechaPago,
          voucherStorageKey: schema.serviciosExtras.voucherStorageKey,
          voucherVerificadoEn: schema.serviciosExtras.voucherVerificadoEn,
        })
        .from(schema.serviciosExtras)
        .where(eq(schema.serviciosExtras.id, id))
        .for("update");

      if (!current) throw new VerificationError("Servicio extra no encontrado", 404);
      if (!canVerifyPayment(auth.user.email, current.codigoContrato ?? "")) {
        throw new VerificationError(
          "No tienes permiso para verificar vouchers de este contrato.",
          403,
        );
      }
      if (current.voucherVerificadoEn) {
        throw new VerificationError("Este voucher ya fue verificado", 409);
      }
      if (current.estado === "PAGADO" && !current.voucherStorageKey) {
        throw new VerificationError(
          "El servicio está marcado como pagado sin voucher: no hay nada que verificar.",
          400,
        );
      }
      if (current.estado !== "DEPOSITADO" && !current.voucherStorageKey) {
        throw new VerificationError(
          "El servicio no tiene un voucher para verificar",
          400,
        );
      }

      const [updated] = await tx
        .update(schema.serviciosExtras)
        .set({
          estado: "PAGADO",
          voucherVerificadoEn: verifiedAt,
          voucherVerificadoPor: auth.user.name,
          fechaPago: current.fechaPago ?? verifiedAt.toISOString().slice(0, 10),
          updatedAt: verifiedAt,
        })
        .where(eq(schema.serviciosExtras.id, id))
        .returning({
          id: schema.serviciosExtras.id,
          contractId: schema.serviciosExtras.contractId,
          codigoContrato: schema.serviciosExtras.codigoContrato,
          estado: schema.serviciosExtras.estado,
          fechaPago: schema.serviciosExtras.fechaPago,
        });
      if (!updated) throw new Error("No se pudo guardar la verificación del voucher");
      return updated;
    });

    await recordAdminAction(dbModule, auth.user, {
      action: "SERVICIOS_EXTRAS_VOUCHER_VERIFIED",
      module: "CONTRACTS",
      entityType: "SERVICIOS_EXTRAS",
      entityId: servicio.id,
      current: {
        contractId: servicio.contractId,
        codigoContrato: servicio.codigoContrato,
        estado: servicio.estado,
        voucherVerificadoEn: verifiedAt.toISOString(),
      },
    });

    const response = NextResponse.json({
      ok: true,
      id: servicio.id,
      estado: servicio.estado,
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
