import { AccessControl, Permission } from "@contract/domain/rbac";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NewNotificationRow } from "@contract/db/schema";
import {
  CONTRACT_EXPIRY_MILESTONES,
  daysUntilDate,
  expiryMilestonesForDays,
  limaToday,
} from "./contract-expiry-alerts";

function createExpiryTask(contractId: string, code: string, endDate: string) {
  const date = endDate.slice(0, 10);
  return {
    titulo: `Seguimiento de vencimiento · ${code}`,
    descripcion: `El contrato ${code} vence el ${date}. Dar seguimiento a su renovación o cierre.`,
    asignadoA: "",
    fechaLimite: new Date(`${date}T12:00:00-05:00`),
    estado: "PENDIENTE",
    creadoPor: "Sistema (vencimiento de contrato)",
    origenTipo: "CONTRATO",
    origenContratoId: contractId,
    origenEvento: "VENCIMIENTO",
  };
}

export async function evaluateContractExpiryNotifications() {
  const { db, schema } = await import("@contract/db");
  const today = limaToday();
  const [users, contracts] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.active, true)),
    db
      .select({
        id: schema.contracts.id,
        code: schema.contracts.codigoContrato,
        endDate: schema.contracts.fechaFin,
        renewedFrom: schema.contracts.renovadoDe,
        tenantNames: schema.clients.nombres,
        tenantLastNames: schema.clients.apellidos,
      })
      .from(schema.contracts)
      .leftJoin(
        schema.clients,
        eq(schema.contracts.clienteId, schema.clients.id),
      )
      .where(
        and(
          inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO"]),
          isNull(schema.contracts.eliminadoEn),
        ),
      ),
  ]);

  const [extraPermissionRows, existingExpiryTasks] = await Promise.all([
    db
      .select({
        userId: schema.userPermissions.userId,
        key: schema.permissions.key,
      })
      .from(schema.userPermissions)
      .innerJoin(
        schema.permissions,
        eq(schema.userPermissions.permissionId, schema.permissions.id),
      ),
    db
      .select({
        id: schema.tasks.id,
        contractId: schema.tasks.origenContratoId,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.origenEvento, "VENCIMIENTO")),
  ]);
  const extraPermissions = new Map<string, Permission[]>();
  for (const row of extraPermissionRows) {
    const list = extraPermissions.get(row.userId) ?? [];
    if (
      typeof row.key === "string" &&
      (Object.values(Permission) as string[]).includes(row.key)
    ) {
      list.push(row.key as Permission);
    }
    extraPermissions.set(row.userId, list);
  }

  const recipientIds = users
    .filter((user) =>
      AccessControl.forRole(
        user.role,
        extraPermissions.get(user.id),
      ).can(Permission.CONTRACT_READ),
    )
    .map((user) => user.id);
  const renewedContractIds = new Set(
    contracts
      .map((contract) => contract.renewedFrom)
      .filter((contractId): contractId is string => Boolean(contractId)),
  );
  const effectiveContracts = contracts.filter(
    (contract) => !renewedContractIds.has(contract.id),
  );
  const rows: NewNotificationRow[] = [];
  const existingExpiryTaskContracts = new Set(
    existingExpiryTasks
      .map((task) => task.contractId)
      .filter((contractId): contractId is string => Boolean(contractId)),
  );
  const taskRows: Array<{
    titulo: string;
    descripcion: string;
    asignadoA: string;
    fechaLimite: Date;
    estado: string;
    creadoPor: string;
    origenTipo: string;
    origenContratoId: string;
    origenEvento: string;
  }> = [];

  for (const contract of effectiveContracts) {
    const endDate = String(contract.endDate).slice(0, 10);
    const daysRemaining = daysUntilDate(today, endDate);
    const tenant =
      [contract.tenantNames, contract.tenantLastNames]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .map((part) => part.trim())
        .join(" ") || "inquilino";
    const hasExistingTask = existingExpiryTaskContracts.has(contract.id);
    if (daysRemaining <= 60 && daysRemaining >= 0) {
      taskRows.push(createExpiryTask(contract.id, contract.code, endDate));
    } else if (hasExistingTask) {
      taskRows.push(createExpiryTask(contract.id, contract.code, endDate));
    }
    for (const milestone of expiryMilestonesForDays(daysRemaining)) {
      const dedupeKey = `contract-expiry:${contract.id}:${contract.endDate}:${milestone}`;
      for (const userId of recipientIds) {
        rows.push({
          userId,
          type: "CONTRACT_EXPIRY",
          title: `Vencimiento de contrato en ${milestone} días`,
          body: `Al inquilino ${tenant} le queda ${milestone} día(s): el contrato ${contract.code} vence el ${endDate}.`,
          href: "/work-123",
          entityType: "CONTRACT",
          entityId: contract.id,
          dedupeKey,
        });
      }

    }
  }

  const retained = new Set(
    rows.map((row) => `${row.userId}:${row.dedupeKey}`),
  );

  return db.transaction(async (tx) => {
    const taskSyncedAt = new Date();
    for (const task of taskRows) {
      await tx
        .insert(schema.tasks)
        .values(task)
        .onConflictDoUpdate({
          target: [
            schema.tasks.origenContratoId,
            schema.tasks.origenEvento,
          ],
          targetWhere: sql`${schema.tasks.origenContratoId} IS NOT NULL AND ${schema.tasks.origenEvento} = 'VENCIMIENTO'`,
          set: {
            titulo: task.titulo,
            descripcion: task.descripcion,
            fechaLimite: task.fechaLimite,
            updatedAt: taskSyncedAt,
          },
        });
    }

    if (rows.length) {
      await tx
        .insert(schema.notifications)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            schema.notifications.userId,
            schema.notifications.dedupeKey,
          ],
          set: {
            isActive: true,
            isRead: sql`CASE WHEN ${schema.notifications.isActive} THEN ${schema.notifications.isRead} ELSE false END`,
            readAt: sql`CASE WHEN ${schema.notifications.isActive} THEN ${schema.notifications.readAt} ELSE NULL END`,
            createdAt: sql`CASE WHEN ${schema.notifications.isActive} THEN ${schema.notifications.createdAt} ELSE now() END`,
          },
        });
    }

    const activeExpiryAlerts = await tx
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        dedupeKey: schema.notifications.dedupeKey,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, "CONTRACT_EXPIRY"),
          eq(schema.notifications.isActive, true),
        ),
      );
    const staleIds = activeExpiryAlerts
      .filter((row) => !retained.has(`${row.userId}:${row.dedupeKey}`))
      .map((row) => row.id);
    for (let offset = 0; offset < staleIds.length; offset += 500) {
      await tx
        .update(schema.notifications)
        .set({ isActive: false })
        .where(inArray(schema.notifications.id, staleIds.slice(offset, offset + 500)));
    }

    return {
      today,
      contractsEvaluated: effectiveContracts.length,
      notificationsSynchronized: rows.length,
      contractTasksSynchronized: taskRows.length,
      milestones: CONTRACT_EXPIRY_MILESTONES,
    };
  });
}
