import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import {
  addSessionCookiesIfRefreshed,
  resolveClientPortalIdentity,
} from "@/lib/client-portal-auth";
import { requirePermission, requireUser } from "@/lib/session";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const BUCKET = "vouchers";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("paymentId") ?? "";
    const voucherId = url.searchParams.get("voucherId") ?? "";
    if (!UUID_PATTERN.test(paymentId) || !UUID_PATTERN.test(voucherId)) {
      return NextResponse.json(
        { error: "Voucher no encontrado." },
        { status: 404 },
      );
    }

    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    let clientId: string | null = null;
    if (session) {
      clientId = session.identity.client.id;
    } else {
      const auth = await requireUser(dbModule, request);
      if ("error" in auth) return auth.error;
      const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
      if (denied) return denied;
    }

    const [payment] = await dbModule.db
      .select({
        id: dbModule.schema.payments.id,
        contractClientId: dbModule.schema.contracts.clienteId,
        voucherEntries: dbModule.schema.payments.vouchers,
      })
      .from(dbModule.schema.payments)
      .innerJoin(
        dbModule.schema.contracts,
        eq(dbModule.schema.contracts.id, dbModule.schema.payments.contractId),
      )
      .where(
        and(
          eq(dbModule.schema.payments.id, paymentId),
          isNull(dbModule.schema.payments.eliminadoEn),
        ),
      )
      .limit(1);
    if (!payment || (clientId && payment.contractClientId !== clientId)) {
      return NextResponse.json(
        { error: "Voucher no encontrado." },
        { status: 404 },
      );
    }

    const expectedUrl = `/api/portal-cliente/pagos/voucher?paymentId=${paymentId}&voucherId=${voucherId}`;
    const voucher = Array.isArray(payment.voucherEntries)
      ? payment.voucherEntries.find(
          (entry) =>
            entry.url === expectedUrl &&
            typeof entry.storageKey === "string" &&
            entry.storageKey.startsWith(
              `client-payment-vouchers/${payment.contractClientId}/${paymentId}/${voucherId}.`,
            ),
        )
      : undefined;
    if (!voucher || !voucher.storageKey) {
      return NextResponse.json(
        { error: "Voucher no encontrado." },
        { status: 404 },
      );
    }

    const bytes = await downloadObject(voucher.storageKey, BUCKET);
    const response = new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": voucher.nombre.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : voucher.nombre.toLowerCase().endsWith(".png")
            ? "image/png"
            : voucher.nombre.toLowerCase().endsWith(".webp")
              ? "image/webp"
              : "image/jpeg",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(voucher.nombre)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return session ? addSessionCookiesIfRefreshed(response, session) : response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener el voucher.",
      },
      { status: 500 },
    );
  }
}
