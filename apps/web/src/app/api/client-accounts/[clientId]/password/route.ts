import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { findCurrentClientContract } from "@/lib/client-portal-auth";
import { generateClientPassword } from "@/lib/client-accounts";
import {
  setAuthUserBannedById,
  updateAuthPasswordById,
} from "@/lib/users-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.USER_MANAGE);
    if (denied) return denied;

    const [row] = await dbModule.db
      .select({
        id: dbModule.schema.clientPortalAccounts.id,
        authUserId: dbModule.schema.clientPortalAccounts.authUserId,
        departmentCode: dbModule.schema.clients.codigoDepartamento,
        clientActive: dbModule.schema.clients.activo,
        deletedAt: dbModule.schema.clients.eliminadoEn,
      })
      .from(dbModule.schema.clientPortalAccounts)
      .innerJoin(
        dbModule.schema.clients,
        eq(dbModule.schema.clients.id, dbModule.schema.clientPortalAccounts.clientId),
      )
      .where(eq(dbModule.schema.clientPortalAccounts.clientId, params.clientId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "No existe una cuenta para este cliente." }, { status: 404 });
    }

    const contract = row.departmentCode
      ? await findCurrentClientContract(dbModule, params.clientId, row.departmentCode)
      : null;
    if (!row.clientActive || row.deletedAt || !contract) {
      return NextResponse.json(
        { error: "Solo se puede emitir una contraseña con un contrato vigente." },
        { status: 409 },
      );
    }
    await setAuthUserBannedById(row.authUserId, true);
    await dbModule.db
      .update(dbModule.schema.clientPortalAccounts)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(dbModule.schema.clientPortalAccounts.id, row.id),
          eq(dbModule.schema.clientPortalAccounts.clientId, params.clientId),
        ),
      );
    const password = generateClientPassword();
    await updateAuthPasswordById(row.authUserId, password);
    await dbModule.db
      .update(dbModule.schema.clientPortalAccounts)
      .set({
        active: true,
        contractId: contract.id,
        credentialPeriodKey: contract.periodKey,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dbModule.schema.clientPortalAccounts.id, row.id),
          eq(dbModule.schema.clientPortalAccounts.clientId, params.clientId),
        ),
      );
    await setAuthUserBannedById(row.authUserId, false);

    return NextResponse.json({ active: true, password });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la contraseña del cliente.",
      },
      { status: 500 },
    );
  }
}
