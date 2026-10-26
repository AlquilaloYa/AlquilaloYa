import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  clientPortalAuthEmail,
  findCurrentClientContracts,
} from "@/lib/client-portal-auth";
import {
  setAuthUserBannedById,
  updateAuthEmailById,
} from "@/lib/users-admin";

const PASSWORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateClientPassword(): string {
  return Array.from(
    { length: 10 },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
  ).join("");
}

export async function synchronizeClientPortalAccounts(
  dbModule: typeof import("@contract/db"),
): Promise<{ pendingCredentials: number; blocked: number }> {
  const rows = await dbModule.db
    .select({
      accountId: dbModule.schema.clientPortalAccounts.id,
      authUserId: dbModule.schema.clientPortalAccounts.authUserId,
      email: dbModule.schema.clientPortalAccounts.email,
      active: dbModule.schema.clientPortalAccounts.active,
      contractId: dbModule.schema.clientPortalAccounts.contractId,
      credentialPeriodKey: dbModule.schema.clientPortalAccounts.credentialPeriodKey,
      clientId: dbModule.schema.clients.id,
      departmentCode: dbModule.schema.clients.codigoDepartamento,
      clientActive: dbModule.schema.clients.activo,
      deletedAt: dbModule.schema.clients.eliminadoEn,
    })
    .from(dbModule.schema.clientPortalAccounts)
    .innerJoin(
      dbModule.schema.clients,
      eq(dbModule.schema.clients.id, dbModule.schema.clientPortalAccounts.clientId),
    );
  const currentContracts = await findCurrentClientContracts(
    dbModule,
    rows.flatMap((row) =>
      row.clientActive && !row.deletedAt && row.departmentCode
        ? [{ clientId: row.clientId, departmentCode: row.departmentCode }]
        : [],
    ),
  );
  let pendingCredentials = 0;
  let blocked = 0;

  for (const row of rows) {
    const contract = currentContracts.get(row.clientId) ?? null;
    if (contract) {
      const authEmail = clientPortalAuthEmail(row.departmentCode ?? "");
      if (
        row.contractId === contract.id &&
        row.email.toLowerCase() === authEmail.toLowerCase() &&
        ((!row.active) || row.credentialPeriodKey === contract.periodKey)
      ) continue;

      if (row.email.toLowerCase() !== authEmail.toLowerCase()) {
        await updateAuthEmailById(row.authUserId, authEmail);
      }
      await setAuthUserBannedById(row.authUserId, true);
      await dbModule.db
        .update(dbModule.schema.clientPortalAccounts)
        .set({
          active: false,
          email: authEmail,
          contractId: contract.id,
          updatedAt: new Date(),
        })
        .where(eq(dbModule.schema.clientPortalAccounts.id, row.accountId));
      pendingCredentials += 1;
    } else if (row.active) {
      await setAuthUserBannedById(row.authUserId, true);
      await dbModule.db
        .update(dbModule.schema.clientPortalAccounts)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(dbModule.schema.clientPortalAccounts.id, row.accountId));
      blocked += 1;
    }
  }

  return { pendingCredentials, blocked };
}
