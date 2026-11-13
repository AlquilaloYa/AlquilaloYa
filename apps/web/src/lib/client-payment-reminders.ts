import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ACTIVE_CLIENT_CONTRACT_STATUSES,
  peruDateString,
} from "@/lib/client-portal-auth";
import {
  centsToMoney,
  moneyToCents,
  monthlyPaymentCents,
  paymentReminderKind,
  servicePaymentCents,
  shiftIsoDate,
} from "@/lib/client-payment-utils";
import { notificationRows } from "@/lib/notifications";
import { getClientPaymentNotificationRecipients } from "@/lib/client-payment-notifications";

type DueReminder = {
  clientId: string;
  clientName: string;
  departmentCode: string;
  targetId: string;
  entityType: "PAYMENT" | "SERVICIOS_EXTRAS_PAGO";
  title: string;
  dueDate: string;
  amountCents: number;
};

function unverifiedVoucherCents(value: unknown): {
  cents: number;
  hasUnpriced: boolean;
} {
  if (!Array.isArray(value)) return { cents: 0, hasUnpriced: false };
  let cents = 0;
  let hasUnpriced = false;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const voucher = item as Record<string, unknown>;
    if (voucher.verificadoEn) continue;
    const amount =
      typeof voucher.monto === "number" || typeof voucher.monto === "string"
        ? moneyToCents(voucher.monto)
        : null;
    if (amount === null) {
      hasUnpriced = true;
    } else {
      cents += amount;
    }
  }
  return { cents, hasUnpriced };
}

export async function sendClientPaymentReminders(
  dbModule: typeof import("@contract/db"),
): Promise<{ clientsNotified: number; erpUsersNotified: number }> {
  const today = peruDateString();
  const twoDaysAhead = shiftIsoDate(today, 2);
  if (!twoDaysAhead)
    throw new Error("No se pudo calcular la fecha de recordatorio.");
  const reminderDates = [today, twoDaysAhead];
  const schema = dbModule.schema;
  const [monthlyRows, serviceRows, recipients] = await Promise.all([
    dbModule.db
      .select({
        id: schema.payments.id,
        clientId: schema.contracts.clienteId,
        clientName: sql<string>`trim(coalesce(${schema.clients.nombres}, '') || ' ' || coalesce(${schema.clients.apellidos}, ''))`,
        departmentCode: schema.departments.codigo,
        dueDate: schema.payments.periodo,
        rent: schema.payments.monto,
        maintenance: schema.payments.mantenimiento,
        paid: schema.payments.montoPagado,
        status: schema.payments.estado,
        vouchers: schema.payments.vouchers,
        voucherUrl: schema.payments.voucherUrl,
      })
      .from(schema.payments)
      .innerJoin(
        schema.contracts,
        eq(schema.contracts.id, schema.payments.contractId),
      )
      .innerJoin(
        schema.clients,
        eq(schema.clients.id, schema.contracts.clienteId),
      )
      .innerJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId),
      )
      .innerJoin(
        schema.clientPortalAccounts,
        and(
          eq(schema.clientPortalAccounts.clientId, schema.clients.id),
          eq(schema.clientPortalAccounts.contractId, schema.contracts.id),
          eq(schema.clientPortalAccounts.active, true),
        ),
      )
      .where(
        and(
          inArray(schema.payments.periodo, reminderDates),
          inArray(schema.contracts.estado, ACTIVE_CLIENT_CONTRACT_STATUSES),
          eq(schema.clients.activo, true),
          isNull(schema.clients.eliminadoEn),
          isNull(schema.contracts.eliminadoEn),
          isNull(schema.payments.eliminadoEn),
        ),
      ),
    dbModule.db
      .select({
        id: schema.serviciosExtrasPagos.id,
        clientId: schema.contracts.clienteId,
        clientName: sql<string>`trim(coalesce(${schema.clients.nombres}, '') || ' ' || coalesce(${schema.clients.apellidos}, ''))`,
        departmentCode: schema.departments.codigo,
        dueDate: schema.serviciosExtrasPagos.fechaVencimiento,
        voucherStorageKey: schema.serviciosExtrasPagos.voucherStorageKey,
        voucherVerificadoEn: schema.serviciosExtrasPagos.voucherVerificadoEn,
        title: sql<string>`CASE
          WHEN ${schema.serviciosExtras.incluyeInternet} AND ${schema.serviciosExtras.incluyeCargaElectrica}
            THEN 'Internet + carga eléctrica'
          WHEN ${schema.serviciosExtras.incluyeInternet}
            THEN 'Internet'
          ELSE 'Carga eléctrica'
        END`,
        incluyeInternet: schema.serviciosExtras.incluyeInternet,
        incluyeCargaElectrica: schema.serviciosExtras.incluyeCargaElectrica,
        montoInternet: schema.serviciosExtras.montoInternet,
        montoCargaElectrica: schema.serviciosExtras.montoCargaElectrica,
        montoTotal: schema.serviciosExtras.montoTotal,
      })
      .from(schema.serviciosExtrasPagos)
      .innerJoin(
        schema.serviciosExtras,
        eq(schema.serviciosExtras.id, schema.serviciosExtrasPagos.servicioId),
      )
      .innerJoin(
        schema.contracts,
        eq(schema.contracts.id, schema.serviciosExtras.contractId),
      )
      .innerJoin(
        schema.clients,
        eq(schema.clients.id, schema.contracts.clienteId),
      )
      .innerJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId),
      )
      .innerJoin(
        schema.clientPortalAccounts,
        and(
          eq(schema.clientPortalAccounts.clientId, schema.clients.id),
          eq(schema.clientPortalAccounts.contractId, schema.contracts.id),
          eq(schema.clientPortalAccounts.active, true),
        ),
      )
      .where(
        and(
          inArray(schema.serviciosExtrasPagos.fechaVencimiento, reminderDates),
          isNull(schema.serviciosExtrasPagos.voucherStorageKey),
          isNull(schema.serviciosExtrasPagos.voucherVerificadoEn),
          inArray(schema.contracts.estado, ACTIVE_CLIENT_CONTRACT_STATUSES),
          eq(schema.clients.activo, true),
          isNull(schema.clients.eliminadoEn),
          isNull(schema.contracts.eliminadoEn),
        ),
      ),
    getClientPaymentNotificationRecipients(dbModule),
  ]);

  const reminders: DueReminder[] = [];
  for (const row of monthlyRows) {
    const dueDate = String(row.dueDate).slice(0, 10);
    if (!paymentReminderKind(dueDate, today)) continue;
    if (["PAGADO", "FINALIZADO"].includes(row.status)) continue;
    const total = monthlyPaymentCents(row.rent, row.maintenance);
    const paid = moneyToCents(row.paid);
    if (total === null || paid === null) {
      throw new Error(`Monto mensual no válido para el pago ${row.id}.`);
    }
    const pending = unverifiedVoucherCents(row.vouchers);
    if (pending.hasUnpriced || (!row.vouchers.length && row.voucherUrl)) {
      continue;
    }
    const remaining = Math.max(0, total - paid - pending.cents);
    if (!remaining) continue;
    reminders.push({
      clientId: row.clientId,
      clientName: row.clientName.trim(),
      departmentCode: row.departmentCode,
      targetId: row.id,
      entityType: "PAYMENT",
      title: "Mensualidad + mantenimiento",
      dueDate,
      amountCents: remaining,
    });
  }

  for (const row of serviceRows) {
    const dueDate = String(row.dueDate).slice(0, 10);
    if (!paymentReminderKind(dueDate, today)) continue;
    const amountCents = servicePaymentCents(row);
    if (amountCents === null) {
      throw new Error(`Monto de servicio no válido para el pago ${row.id}.`);
    }
    if (amountCents <= 0) continue;
    reminders.push({
      clientId: row.clientId,
      clientName: row.clientName.trim(),
      departmentCode: row.departmentCode,
      targetId: row.id,
      entityType: "SERVICIOS_EXTRAS_PAGO",
      title: row.title,
      dueDate,
      amountCents,
    });
  }

  const clientNotifications: Array<
    typeof schema.clientPortalNotifications.$inferInsert
  > = [];
  const erpNotifications: Array<typeof schema.notifications.$inferInsert> = [];
  for (const reminder of reminders) {
    const kind = paymentReminderKind(reminder.dueDate, today);
    if (!kind) continue;
    const dueToday = kind === "DUE_DATE";
    const suffix = dueToday ? "due" : "two-days";
    const title = dueToday ? "Pago vence hoy" : "Pago próximo a vencer";
    const body = `${reminder.title}: S/ ${centsToMoney(reminder.amountCents)}. Fecha de pago: ${reminder.dueDate}.`;
    const dedupeKey = `client-payment-due:${reminder.targetId}:${suffix}`;
    clientNotifications.push({
      clientId: reminder.clientId,
      workOrderId: null,
      type: "PAYMENT_DUE",
      title,
      body,
      dedupeKey,
    });
    if (recipients.length) {
      erpNotifications.push(
        ...notificationRows(recipients, {
          type: "CLIENT_PAYMENT_DUE",
          title: dueToday
            ? "Pago de cliente vence hoy"
            : "Pago de cliente próximo a vencer",
          body: `${reminder.clientName} · ${reminder.departmentCode} · ${reminder.title} · S/ ${centsToMoney(reminder.amountCents)} · ${reminder.dueDate}`,
          href: "/pagos",
          entityType: reminder.entityType,
          entityId: reminder.targetId,
          dedupeKey,
        }),
      );
    }
  }

  if (clientNotifications.length || erpNotifications.length) {
    await dbModule.db.transaction(async (tx) => {
      if (clientNotifications.length) {
        await tx
          .insert(schema.clientPortalNotifications)
          .values(clientNotifications)
          .onConflictDoNothing();
      }
      if (erpNotifications.length) {
        await tx
          .insert(schema.notifications)
          .values(erpNotifications)
          .onConflictDoNothing();
      }
    });
  }
  return {
    clientsNotified: clientNotifications.length,
    erpUsersNotified: erpNotifications.length,
  };
}
