import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  findCurrentClientContract,
  peruDateString,
  resolveClientPortalIdentity,
  sameOriginRequest,
} from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { getClientPaymentNotificationRecipients } from "@/lib/client-payment-notifications";
import {
  centsToMoney,
  moneyToCents,
  monthlyPaymentCents,
  servicePaymentCents,
  validatePaymentAmount,
} from "@/lib/client-payment-utils";
import { notificationRows } from "@/lib/notifications";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";
import {
  matchesLocalFileSignature,
  maxLocalUploadBytes,
} from "@/lib/locales-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "vouchers";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PortalPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function cleanFileName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return normalized || "voucher";
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new PortalPaymentError("Tipo de voucher no admitido.", 400);
  }
}

function voucherRows(value: unknown): Array<{
  nombre: string;
  url: string;
  monto?: number;
  verificadoEn?: string;
  storageKey?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (
      item,
    ): item is {
      nombre: string;
      url: string;
      monto?: number;
      verificadoEn?: string;
      storageKey?: string;
    } =>
      !!item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).nombre === "string" &&
      typeof (item as Record<string, unknown>).url === "string",
  );
}

function pendingVoucherBalance(vouchers: ReturnType<typeof voucherRows>): {
  cents: number;
  hasUnpricedVoucher: boolean;
} {
  let cents = 0;
  let hasUnpricedVoucher = false;
  for (const voucher of vouchers) {
    if (voucher.verificadoEn) continue;
    const amount =
      voucher.monto === undefined ? null : moneyToCents(voucher.monto);
    if (amount === null) {
      hasUnpricedVoucher = true;
    } else {
      cents += amount;
    }
  }
  return { cents, hasUnpricedVoucher };
}

function serviceAmountCents(service: {
  montoTotal: string | null;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoInternet: string;
  montoCargaElectrica: string;
}): number {
  const total = servicePaymentCents(service);
  if (total === null) {
    throw new PortalPaymentError(
      "El ERP tiene un monto de servicio no válido. Contacta a administración.",
      503,
    );
  }
  return total;
}

async function getActiveContract(
  request: Request,
  dbModule: typeof import("@contract/db"),
) {
  const session = await resolveClientPortalIdentity(request, dbModule);
  if (!session) throw new PortalPaymentError("Sesión no válida.", 401);
  const contract = await findCurrentClientContract(
    dbModule,
    session.identity.client.id,
    session.identity.client.departmentCode,
  );
  if (!contract) {
    throw new PortalPaymentError(
      "No encontramos un contrato vigente para este departamento.",
      404,
    );
  }
  return { session, contract };
}

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const { session, contract } = await getActiveContract(request, dbModule);
    const today = peruDateString();
    const [monthlyRows, serviceRows, approvalRows] = await Promise.all([
      dbModule.db
        .select({
          id: dbModule.schema.payments.id,
          periodo: dbModule.schema.payments.periodo,
          monto: dbModule.schema.payments.monto,
          mantenimiento: dbModule.schema.payments.mantenimiento,
          montoPagado: dbModule.schema.payments.montoPagado,
          estado: dbModule.schema.payments.estado,
          vouchers: dbModule.schema.payments.vouchers,
          voucherUrl: dbModule.schema.payments.voucherUrl,
        })
        .from(dbModule.schema.payments)
        .where(
          and(
            eq(dbModule.schema.payments.contractId, contract.id),
            isNull(dbModule.schema.payments.eliminadoEn),
          ),
        )
        .orderBy(desc(dbModule.schema.payments.periodo))
        .limit(36),
      dbModule.db
        .select({
          id: dbModule.schema.serviciosExtrasPagos.id,
          servicioId: dbModule.schema.serviciosExtras.id,
          periodo: dbModule.schema.serviciosExtrasPagos.periodo,
          dueDate: dbModule.schema.serviciosExtrasPagos.fechaVencimiento,
          voucherStorageKey:
            dbModule.schema.serviciosExtrasPagos.voucherStorageKey,
          voucherFilename: dbModule.schema.serviciosExtrasPagos.voucherFilename,
          voucherVerificadoEn:
            dbModule.schema.serviciosExtrasPagos.voucherVerificadoEn,
          tipoServicio: dbModule.schema.serviciosExtras.tipoServicio,
          incluyeInternet: dbModule.schema.serviciosExtras.incluyeInternet,
          incluyeCargaElectrica:
            dbModule.schema.serviciosExtras.incluyeCargaElectrica,
          montoInternet: dbModule.schema.serviciosExtras.montoInternet,
          montoCargaElectrica:
            dbModule.schema.serviciosExtras.montoCargaElectrica,
          montoTotal: dbModule.schema.serviciosExtras.montoTotal,
        })
        .from(dbModule.schema.serviciosExtrasPagos)
        .innerJoin(
          dbModule.schema.serviciosExtras,
          eq(
            dbModule.schema.serviciosExtras.id,
            dbModule.schema.serviciosExtrasPagos.servicioId,
          ),
        )
        .where(eq(dbModule.schema.serviciosExtras.contractId, contract.id))
        .orderBy(desc(dbModule.schema.serviciosExtrasPagos.fechaVencimiento))
        .limit(36),
      dbModule.db
        .select()
        .from(dbModule.schema.clientPaymentApprovalRequests)
        .where(
          and(
            eq(
              dbModule.schema.clientPaymentApprovalRequests.clientId,
              session.identity.client.id,
            ),
            eq(
              dbModule.schema.clientPaymentApprovalRequests.contractId,
              contract.id,
            ),
          ),
        )
        .orderBy(desc(dbModule.schema.clientPaymentApprovalRequests.createdAt))
        .limit(200),
    ]);

    const obligations: Array<{
      id: string;
      targetType: "MONTHLY" | "SERVICE";
      title: string;
      dueDate: string;
      totalAmount: string;
      paidAmount: string;
      remainingAmount: string;
      status: "PAID" | "UPLOADED" | "DUE";
      canUpload: boolean;
      approvalStatus: string | null;
      approvalId: string | null;
      period?: string;
      voucherFilename?: string | null;
    }> = monthlyRows.map((row) => {
      const dueDate = String(row.periodo).slice(0, 10);
      const totalCents = monthlyPaymentCents(row.monto, row.mantenimiento);
      const paidCents = moneyToCents(row.montoPagado);
      if (totalCents === null || paidCents === null) {
        throw new PortalPaymentError(
          "El ERP tiene un monto mensual no válido. Contacta a administración.",
          503,
        );
      }
      const vouchers = voucherRows(row.vouchers);
      const pending = pendingVoucherBalance(vouchers);
      const legacyVoucherPending =
        vouchers.length === 0 && Boolean(row.voucherUrl);
      const alreadyPaid = ["PAGADO", "FINALIZADO"].includes(row.estado);
      const remainingCents = alreadyPaid
        ? 0
        : Math.max(0, totalCents - paidCents - pending.cents);
      const approval = approvalRows.find((item) => item.paymentId === row.id);
      return {
        id: row.id,
        targetType: "MONTHLY" as const,
        title: "Mensualidad + mantenimiento",
        dueDate,
        totalAmount: centsToMoney(totalCents),
        paidAmount: centsToMoney(paidCents),
        remainingAmount: centsToMoney(remainingCents),
        status: alreadyPaid
          ? "PAID"
          : pending.cents > 0 ||
              pending.hasUnpricedVoucher ||
              legacyVoucherPending
            ? "UPLOADED"
            : remainingCents === 0
              ? "PAID"
              : "DUE",
        canUpload:
          !alreadyPaid &&
          remainingCents > 0 &&
          !pending.hasUnpricedVoucher &&
          !legacyVoucherPending &&
          pending.cents < totalCents &&
          (dueDate >= today || approval?.status === "APPROVED"),
        approvalStatus: approval?.status ?? null,
        approvalId: approval?.id ?? null,
      };
    });

    for (const row of serviceRows) {
      if (row.voucherVerificadoEn) continue;
      const totalCents = serviceAmountCents(row);
      if (totalCents <= 0) continue;
      const approval = approvalRows.find(
        (item) => item.serviciosExtrasPagoId === row.id,
      );
      const uploaded = Boolean(row.voucherStorageKey);
      obligations.push({
        id: row.id,
        targetType: "SERVICE" as const,
        title:
          row.incluyeInternet && row.incluyeCargaElectrica
            ? "Internet + carga eléctrica"
            : row.incluyeInternet
              ? "Internet"
              : "Carga eléctrica",
        dueDate: String(row.dueDate).slice(0, 10),
        totalAmount: centsToMoney(totalCents),
        paidAmount: "0.00",
        remainingAmount: uploaded ? "0.00" : centsToMoney(totalCents),
        status: uploaded ? "UPLOADED" : "DUE",
        canUpload:
          !uploaded &&
          (String(row.dueDate).slice(0, 10) >= today ||
            approval?.status === "APPROVED"),
        approvalStatus: approval?.status ?? null,
        approvalId: approval?.id ?? null,
        period: row.periodo,
        voucherFilename: row.voucherFilename,
      });
    }

    obligations.sort((left, right) =>
      left.dueDate.localeCompare(right.dueDate),
    );
    const response = NextResponse.json({ obligations, today });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    if (error instanceof PortalPaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar tus pagos.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403 },
    );
  }
  let uploadedKey: string | null = null;
  try {
    const dbModule = await import("@contract/db");
    const { session, contract } = await getActiveContract(request, dbModule);
    if (
      !(await checkClientPortalLimit(
        `client-payment:${session.identity.client.id}:${clientIp(request.headers)}`,
        10,
        10 * 60_000,
      ))
    ) {
      return NextResponse.json(
        { error: "Demasiadas operaciones de pago. Inténtalo más tarde." },
        { status: 429 },
      );
    }

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (!isStorageConfigured()) {
        return NextResponse.json(
          { error: "El almacenamiento privado no está configurado." },
          { status: 503 },
        );
      }
      const form = await request.formData();
      const targetType = form.get("targetType");
      const targetId = form.get("targetId");
      const approvalRequestId = form.get("approvalRequestId");
      const amountValue = form.get("amount");
      const file = form.get("file");
      if (
        (targetType !== "MONTHLY" && targetType !== "SERVICE") ||
        typeof targetId !== "string" ||
        !UUID_PATTERN.test(targetId) ||
        (approvalRequestId !== null &&
          (typeof approvalRequestId !== "string" ||
            !UUID_PATTERN.test(approvalRequestId))) ||
        typeof amountValue !== "string" ||
        !/^\d+(?:\.\d{1,2})?$/.test(amountValue) ||
        !(file instanceof File) ||
        file.size < 1
      ) {
        return NextResponse.json(
          { error: "Datos de pago o voucher no válidos." },
          { status: 400 },
        );
      }
      const amountCents = moneyToCents(amountValue);
      const maxBytes = maxLocalUploadBytes(file.type);
      if (amountCents === null || maxBytes === null) {
        return NextResponse.json(
          {
            error:
              "El voucher debe ser PDF, JPG, PNG o WebP, con un monto válido.",
          },
          { status: 400 },
        );
      }
      if (file.size > maxBytes) {
        return NextResponse.json(
          {
            error: `El voucher supera el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
          },
          { status: 413 },
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesLocalFileSignature(file.type, bytes)) {
        return NextResponse.json(
          {
            error: "El contenido no coincide con el tipo de archivo indicado.",
          },
          { status: 400 },
        );
      }

      const voucherId = randomUUID();
      const filename = cleanFileName(file.name);
      const extension = extensionForMimeType(file.type);
      const storageKey =
        targetType === "MONTHLY"
          ? `client-payment-vouchers/${session.identity.client.id}/${targetId}/${voucherId}.${extension}`
          : `client-payment-vouchers/services/${session.identity.client.id}/${targetId}/${voucherId}.${extension}`;
      const uploaded = await uploadObject(storageKey, bytes, file.type, BUCKET);
      uploadedKey = uploaded.key;
      const recipients = await getClientPaymentNotificationRecipients(dbModule);
      const today = peruDateString();

      const result = await dbModule.db.transaction(async (tx) => {
        if (targetType === "MONTHLY") {
          const [payment] = await tx
            .select({
              id: dbModule.schema.payments.id,
              contractId: dbModule.schema.payments.contractId,
              periodo: dbModule.schema.payments.periodo,
              monto: dbModule.schema.payments.monto,
              mantenimiento: dbModule.schema.payments.mantenimiento,
              montoPagado: dbModule.schema.payments.montoPagado,
              estado: dbModule.schema.payments.estado,
              vouchers: dbModule.schema.payments.vouchers,
              voucherUrl: dbModule.schema.payments.voucherUrl,
              voucherNombre: dbModule.schema.payments.voucherNombre,
            })
            .from(dbModule.schema.payments)
            .where(
              and(
                eq(dbModule.schema.payments.id, targetId),
                eq(dbModule.schema.payments.contractId, contract.id),
                isNull(dbModule.schema.payments.eliminadoEn),
              ),
            )
            .for("update");
          if (!payment) {
            throw new PortalPaymentError("El pago mensual no existe.", 404);
          }
          const dueDate = String(payment.periodo).slice(0, 10);
          const totalCents = monthlyPaymentCents(
            payment.monto,
            payment.mantenimiento,
          );
          const paidCents = moneyToCents(payment.montoPagado);
          if (totalCents === null || paidCents === null) {
            throw new PortalPaymentError(
              "El ERP tiene un monto mensual no válido. Contacta a administración.",
              503,
            );
          }
          const existingVouchers = voucherRows(payment.vouchers);
          const pending = pendingVoucherBalance(existingVouchers);
          const legacyVoucherPending =
            existingVouchers.length === 0 && Boolean(payment.voucherUrl);
          const alreadyPaid = ["PAGADO", "FINALIZADO"].includes(payment.estado);
          const remainingCents = alreadyPaid
            ? 0
            : Math.max(0, totalCents - paidCents - pending.cents);
          if (
            alreadyPaid ||
            pending.hasUnpricedVoucher ||
            legacyVoucherPending ||
            remainingCents === 0
          ) {
            throw new PortalPaymentError(
              "Este pago no tiene saldo disponible para subir otro voucher.",
              409,
            );
          }

          let approvalId: string | null = null;
          let approvedAmountCents: number | null = null;
          if (dueDate < today) {
            const [approval] = await tx
              .select({
                id: dbModule.schema.clientPaymentApprovalRequests.id,
                requestedAmount:
                  dbModule.schema.clientPaymentApprovalRequests.requestedAmount,
              })
              .from(dbModule.schema.clientPaymentApprovalRequests)
              .where(
                and(
                  eq(
                    dbModule.schema.clientPaymentApprovalRequests.clientId,
                    session.identity.client.id,
                  ),
                  eq(
                    dbModule.schema.clientPaymentApprovalRequests.contractId,
                    contract.id,
                  ),
                  eq(
                    dbModule.schema.clientPaymentApprovalRequests.paymentId,
                    payment.id,
                  ),
                  eq(
                    dbModule.schema.clientPaymentApprovalRequests.status,
                    "APPROVED",
                  ),
                ),
              )
              .for("update");
            if (!approval || approvalRequestId !== approval.id) {
              throw new PortalPaymentError(
                "El ERP debe aprobar primero la solicitud de pago vencido.",
                403,
              );
            }
            approvalId = approval.id;
            approvedAmountCents = moneyToCents(approval.requestedAmount);
            if (
              approvedAmountCents === null ||
              amountCents > approvedAmountCents
            ) {
              throw new PortalPaymentError(
                "El monto supera el saldo autorizado por administración.",
                403,
              );
            }
          } else if (approvalRequestId !== null) {
            throw new PortalPaymentError(
              "La autorización no corresponde a este pago.",
              400,
            );
          }
          const amountError = validatePaymentAmount({
            amountCents,
            remainingCents,
            dueDate,
            today,
            allowPartialWhenOverdue:
              targetType === "MONTHLY" && approvalId !== null,
          });
          if (amountError) {
            throw new PortalPaymentError(
              amountError === "full_payment_required"
                ? "En la fecha de vencimiento o después, debes depositar el saldo completo."
                : amountError === "amount_exceeds_balance"
                  ? "El monto supera el saldo de mensualidad y mantenimiento."
                  : "El monto del voucher no es válido.",
              400,
            );
          }

          const voucherUrl = `/api/portal-cliente/pagos/voucher?paymentId=${payment.id}&voucherId=${voucherId}`;
          const vouchers = [
            ...existingVouchers,
            {
              nombre: filename,
              url: voucherUrl,
              monto: amountCents / 100,
              storageKey,
            },
          ];
          await tx
            .update(dbModule.schema.payments)
            .set({
              voucherNombre: payment.voucherNombre ?? filename,
              voucherUrl: payment.voucherUrl ?? voucherUrl,
              vouchers,
              estado: "DEPOSITADO",
              fechaPago: today,
              updatedAt: new Date(),
            })
            .where(eq(dbModule.schema.payments.id, payment.id));
          if (approvalId) {
            await tx
              .update(dbModule.schema.clientPaymentApprovalRequests)
              .set({ status: "USED", updatedAt: new Date() })
              .where(
                eq(
                  dbModule.schema.clientPaymentApprovalRequests.id,
                  approvalId,
                ),
              );
          }

          await tx
            .insert(dbModule.schema.clientPortalNotifications)
            .values({
              clientId: session.identity.client.id,
              workOrderId: null,
              type: "PAYMENT_VOUCHER_UPLOADED",
              title: "Voucher recibido",
              body: `Recibimos tu depósito de S/ ${centsToMoney(amountCents)} para mensualidad y mantenimiento. Está pendiente de verificación.`,
              dedupeKey: `payment-voucher:${voucherId}`,
            })
            .onConflictDoNothing();
          if (recipients.length) {
            await tx
              .insert(dbModule.schema.notifications)
              .values(
                notificationRows(recipients, {
                  type: "CLIENT_PAYMENT_UPLOADED",
                  title: "Nuevo voucher de mensualidad",
                  body: `${session.identity.client.names} · ${session.identity.client.departmentCode} · S/ ${centsToMoney(amountCents)}`,
                  href: "/pagos",
                  entityType: "PAYMENT",
                  entityId: payment.id,
                  dedupeKey: `client-payment-voucher:${voucherId}`,
                }),
              )
              .onConflictDoNothing();
          }
          return { id: payment.id, voucherId, targetType };
        }

        const [servicePayment] = await tx
          .select({
            id: dbModule.schema.serviciosExtrasPagos.id,
            dueDate: dbModule.schema.serviciosExtrasPagos.fechaVencimiento,
            voucherStorageKey:
              dbModule.schema.serviciosExtrasPagos.voucherStorageKey,
            voucherVerificadoEn:
              dbModule.schema.serviciosExtrasPagos.voucherVerificadoEn,
            contractId: dbModule.schema.serviciosExtras.contractId,
            incluyeInternet: dbModule.schema.serviciosExtras.incluyeInternet,
            incluyeCargaElectrica:
              dbModule.schema.serviciosExtras.incluyeCargaElectrica,
            montoInternet: dbModule.schema.serviciosExtras.montoInternet,
            montoCargaElectrica:
              dbModule.schema.serviciosExtras.montoCargaElectrica,
            montoTotal: dbModule.schema.serviciosExtras.montoTotal,
          })
          .from(dbModule.schema.serviciosExtrasPagos)
          .innerJoin(
            dbModule.schema.serviciosExtras,
            eq(
              dbModule.schema.serviciosExtras.id,
              dbModule.schema.serviciosExtrasPagos.servicioId,
            ),
          )
          .where(
            and(
              eq(dbModule.schema.serviciosExtrasPagos.id, targetId),
              eq(dbModule.schema.serviciosExtras.contractId, contract.id),
            ),
          )
          .for("update");
        if (!servicePayment) {
          throw new PortalPaymentError("El pago del servicio no existe.", 404);
        }
        if (servicePayment.voucherVerificadoEn) {
          throw new PortalPaymentError("Este servicio ya fue pagado.", 409);
        }
        if (servicePayment.voucherStorageKey) {
          throw new PortalPaymentError(
            "El voucher de este servicio ya está en revisión.",
            409,
          );
        }
        const totalCents = serviceAmountCents(servicePayment);
        const dueDate = String(servicePayment.dueDate).slice(0, 10);
        if (amountCents !== totalCents) {
          throw new PortalPaymentError(
            "Los servicios se pagan por el monto completo indicado por el ERP.",
            400,
          );
        }
        let approvalId: string | null = null;
        if (dueDate < today) {
          const [approval] = await tx
            .select()
            .from(dbModule.schema.clientPaymentApprovalRequests)
            .where(
              and(
                eq(
                  dbModule.schema.clientPaymentApprovalRequests.clientId,
                  session.identity.client.id,
                ),
                eq(
                  dbModule.schema.clientPaymentApprovalRequests.contractId,
                  contract.id,
                ),
                eq(
                  dbModule.schema.clientPaymentApprovalRequests
                    .serviciosExtrasPagoId,
                  servicePayment.id,
                ),
                eq(
                  dbModule.schema.clientPaymentApprovalRequests.status,
                  "APPROVED",
                ),
              ),
            )
            .for("update");
          if (!approval || approvalRequestId !== approval.id) {
            throw new PortalPaymentError(
              "El ERP debe aprobar primero la solicitud de pago vencido.",
              403,
            );
          }
          approvalId = approval.id;
        } else if (approvalRequestId !== null) {
          throw new PortalPaymentError(
            "La autorización no corresponde a este servicio.",
            400,
          );
        }

        const [updated] = await tx
          .update(dbModule.schema.serviciosExtrasPagos)
          .set({
            voucherFilename: filename,
            voucherStorageKey: storageKey,
            voucherMimeType: file.type,
            voucherSizeBytes: String(uploaded.sizeBytes),
            voucherSha256: uploaded.sha256,
            voucherVerificadoEn: null,
            voucherVerificadoPor: null,
            updatedAt: new Date(),
          })
          .where(eq(dbModule.schema.serviciosExtrasPagos.id, servicePayment.id))
          .returning({ id: dbModule.schema.serviciosExtrasPagos.id });
        if (!updated)
          throw new Error("No se pudo registrar el voucher del servicio.");
        if (approvalId) {
          await tx
            .update(dbModule.schema.clientPaymentApprovalRequests)
            .set({ status: "USED", updatedAt: new Date() })
            .where(
              eq(dbModule.schema.clientPaymentApprovalRequests.id, approvalId),
            );
        }
        await tx
          .insert(dbModule.schema.clientPortalNotifications)
          .values({
            clientId: session.identity.client.id,
            workOrderId: null,
            type: "PAYMENT_VOUCHER_UPLOADED",
            title: "Voucher de servicio recibido",
            body: `Recibimos tu voucher de servicio por S/ ${centsToMoney(totalCents)}. Está pendiente de verificación.`,
            dedupeKey: `service-payment-voucher:${voucherId}`,
          })
          .onConflictDoNothing();
        if (recipients.length) {
          await tx
            .insert(dbModule.schema.notifications)
            .values(
              notificationRows(recipients, {
                type: "CLIENT_PAYMENT_UPLOADED",
                title: "Nuevo voucher de servicio",
                body: `${session.identity.client.names} · ${session.identity.client.departmentCode} · S/ ${centsToMoney(totalCents)}`,
                href: "/pagos",
                entityType: "SERVICIOS_EXTRAS_PAGO",
                entityId: servicePayment.id,
                dedupeKey: `client-service-voucher:${voucherId}`,
              }),
            )
            .onConflictDoNothing();
        }
        return { id: servicePayment.id, voucherId, targetType };
      });
      uploadedKey = null;
      const response = NextResponse.json(
        { ok: true, ...result },
        { status: 201 },
      );
      response.headers.set("Cache-Control", "no-store");
      return addSessionCookiesIfRefreshed(response, session);
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
    if (
      values.action !== "request-approval" ||
      (values.targetType !== "MONTHLY" && values.targetType !== "SERVICE") ||
      typeof values.targetId !== "string" ||
      !UUID_PATTERN.test(values.targetId)
    ) {
      return NextResponse.json(
        { error: "Solicitud de autorización no válida." },
        { status: 400 },
      );
    }

    const recipients = await getClientPaymentNotificationRecipients(dbModule);
    const today = peruDateString();
    const created = await dbModule.db.transaction(async (tx) => {
      let dueDate = "";
      let requestedCents = 0;
      if (values.targetType === "MONTHLY") {
        const [payment] = await tx
          .select({
            id: dbModule.schema.payments.id,
            periodo: dbModule.schema.payments.periodo,
            monto: dbModule.schema.payments.monto,
            mantenimiento: dbModule.schema.payments.mantenimiento,
            montoPagado: dbModule.schema.payments.montoPagado,
            estado: dbModule.schema.payments.estado,
            vouchers: dbModule.schema.payments.vouchers,
            voucherUrl: dbModule.schema.payments.voucherUrl,
          })
          .from(dbModule.schema.payments)
          .where(
            and(
              eq(dbModule.schema.payments.id, values.targetId as string),
              eq(dbModule.schema.payments.contractId, contract.id),
              isNull(dbModule.schema.payments.eliminadoEn),
            ),
          )
          .for("update");
        if (!payment)
          throw new PortalPaymentError("El pago mensual no existe.", 404);
        dueDate = String(payment.periodo).slice(0, 10);
        const total = monthlyPaymentCents(payment.monto, payment.mantenimiento);
        const paid = moneyToCents(payment.montoPagado);
        if (total === null || paid === null) {
          throw new PortalPaymentError(
            "El ERP tiene un monto mensual no válido.",
            503,
          );
        }
        const vouchers = voucherRows(payment.vouchers);
        const pending = pendingVoucherBalance(vouchers);
        const legacyPending =
          vouchers.length === 0 && Boolean(payment.voucherUrl);
        requestedCents =
          ["PAGADO", "FINALIZADO"].includes(payment.estado) ||
          pending.hasUnpricedVoucher ||
          legacyPending
            ? 0
            : Math.max(0, total - paid - pending.cents);
      } else {
        const [servicePayment] = await tx
          .select({
            id: dbModule.schema.serviciosExtrasPagos.id,
            dueDate: dbModule.schema.serviciosExtrasPagos.fechaVencimiento,
            voucherStorageKey:
              dbModule.schema.serviciosExtrasPagos.voucherStorageKey,
            voucherVerificadoEn:
              dbModule.schema.serviciosExtrasPagos.voucherVerificadoEn,
            incluyeInternet: dbModule.schema.serviciosExtras.incluyeInternet,
            incluyeCargaElectrica:
              dbModule.schema.serviciosExtras.incluyeCargaElectrica,
            montoInternet: dbModule.schema.serviciosExtras.montoInternet,
            montoCargaElectrica:
              dbModule.schema.serviciosExtras.montoCargaElectrica,
            montoTotal: dbModule.schema.serviciosExtras.montoTotal,
          })
          .from(dbModule.schema.serviciosExtrasPagos)
          .innerJoin(
            dbModule.schema.serviciosExtras,
            eq(
              dbModule.schema.serviciosExtras.id,
              dbModule.schema.serviciosExtrasPagos.servicioId,
            ),
          )
          .where(
            and(
              eq(
                dbModule.schema.serviciosExtrasPagos.id,
                values.targetId as string,
              ),
              eq(dbModule.schema.serviciosExtras.contractId, contract.id),
            ),
          )
          .for("update");
        if (!servicePayment) {
          throw new PortalPaymentError("El pago del servicio no existe.", 404);
        }
        dueDate = String(servicePayment.dueDate).slice(0, 10);
        requestedCents =
          servicePayment.voucherStorageKey || servicePayment.voucherVerificadoEn
            ? 0
            : serviceAmountCents(servicePayment);
      }
      if (dueDate >= today) {
        throw new PortalPaymentError(
          "Solo puedes solicitar autorización cuando la fecha de pago ya venció.",
          400,
        );
      }
      if (requestedCents <= 0) {
        throw new PortalPaymentError(
          "Este pago no tiene un saldo pendiente que requiera autorización.",
          409,
        );
      }

      const targetCondition =
        values.targetType === "MONTHLY"
          ? eq(
              dbModule.schema.clientPaymentApprovalRequests.paymentId,
              values.targetId as string,
            )
          : eq(
              dbModule.schema.clientPaymentApprovalRequests
                .serviciosExtrasPagoId,
              values.targetId as string,
            );
      const [existing] = await tx
        .select({ id: dbModule.schema.clientPaymentApprovalRequests.id })
        .from(dbModule.schema.clientPaymentApprovalRequests)
        .where(
          and(
            targetCondition,
            eq(
              dbModule.schema.clientPaymentApprovalRequests.clientId,
              session.identity.client.id,
            ),
            sql`${dbModule.schema.clientPaymentApprovalRequests.status} IN ('PENDING', 'APPROVED')`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new PortalPaymentError(
          "Ya existe una solicitud de autorización abierta para este pago.",
          409,
        );
      }

      const [requestRow] = await tx
        .insert(dbModule.schema.clientPaymentApprovalRequests)
        .values({
          clientId: session.identity.client.id,
          contractId: contract.id,
          paymentId:
            values.targetType === "MONTHLY"
              ? (values.targetId as string)
              : null,
          serviciosExtrasPagoId:
            values.targetType === "SERVICE"
              ? (values.targetId as string)
              : null,
          dueDate,
          requestedAmount: centsToMoney(requestedCents),
          status: "PENDING",
        })
        .returning({
          id: dbModule.schema.clientPaymentApprovalRequests.id,
        });
      if (!requestRow)
        throw new Error("No se pudo registrar la solicitud de autorización.");

      const targetLabel =
        values.targetType === "MONTHLY"
          ? "mensualidad + mantenimiento"
          : "servicio";
      await tx
        .insert(dbModule.schema.clientPortalNotifications)
        .values({
          clientId: session.identity.client.id,
          workOrderId: null,
          type: "PAYMENT_APPROVAL_REQUESTED",
          title: "Solicitud de pago enviada",
          body: `El ERP debe validar tu solicitud por S/ ${centsToMoney(requestedCents)} antes de continuar con el depósito.`,
          dedupeKey: `payment-approval-requested:${requestRow.id}`,
        })
        .onConflictDoNothing();
      if (recipients.length) {
        await tx
          .insert(dbModule.schema.notifications)
          .values(
            notificationRows(recipients, {
              type: "CLIENT_PAYMENT_APPROVAL",
              title: "Solicitud de pago vencido",
              body: `${session.identity.client.names} · ${session.identity.client.departmentCode} · ${targetLabel} · S/ ${centsToMoney(requestedCents)}`,
              href: "/pedidos-clientes?tab=pagos",
              entityType: "CLIENT_PAYMENT_APPROVAL",
              entityId: requestRow.id,
              dedupeKey: `client-payment-approval:${requestRow.id}`,
            }),
          )
          .onConflictDoNothing();
      }
      return requestRow;
    });
    const response = NextResponse.json(
      { ok: true, request: created },
      { status: 201 },
    );
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error(
          "[client-payment] no se pudo eliminar un voucher incompleto",
          cleanupError,
        );
      }
    }
    if (error instanceof PortalPaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar el pago.",
      },
      { status: 500 },
    );
  }
}
