import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import {
  clientPortalAuthEmail,
  findCurrentClientContract,
  findCurrentClientContracts,
} from "@/lib/client-portal-auth";
import {
  generateClientPassword,
  synchronizeClientPortalAccounts,
} from "@/lib/client-accounts";
import {
  createAuthUser,
  deleteAuthUserById,
} from "@/lib/users-admin";

export const dynamic = "force-dynamic";

async function loadClientRows(dbModule: typeof import("@contract/db")) {
  const { db, schema } = dbModule;
  const [clients, accounts] = await Promise.all([
    db
      .select({
        id: schema.clients.id,
        names: schema.clients.nombres,
        surnames: schema.clients.apellidos,
        departmentCode: schema.clients.codigoDepartamento,
        active: schema.clients.activo,
        deletedAt: schema.clients.eliminadoEn,
      })
      .from(schema.clients)
      .orderBy(schema.clients.nombres, schema.clients.apellidos),
    db.select().from(schema.clientPortalAccounts),
  ]);
  const accountByClient = new Map(accounts.map((account) => [account.clientId, account]));
  const currentContracts = await findCurrentClientContracts(
    dbModule,
    clients.flatMap((client) =>
      client.active && !client.deletedAt && client.departmentCode
        ? [{ clientId: client.id, departmentCode: client.departmentCode }]
        : [],
    ),
  );
  return clients.map((client) => ({
      client,
      account: accountByClient.get(client.id) ?? null,
      currentContract: currentContracts.get(client.id) ?? null,
    }));
}

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.USER_MANAGE);
    if (denied) return denied;

    await synchronizeClientPortalAccounts(dbModule);

    const refreshed = await loadClientRows(dbModule);
    return NextResponse.json({
      items: refreshed.map(({ client, account, currentContract }) => ({
        clientId: client.id,
        name: [client.names, client.surnames].filter(Boolean).join(" "),
        departmentCode: client.departmentCode,
        clientActive: client.active && !client.deletedAt,
        contractActive: Boolean(currentContract && client.active && !client.deletedAt),
        contractEndsAt: currentContract?.endsAt ?? null,
        account: account
          ? {
              active: account.active,
              credentialPending: Boolean(
                currentContract &&
                  (!account.active ||
                    account.contractId !== currentContract.id ||
                    account.credentialPeriodKey !== currentContract.periodKey),
              ),
            }
          : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las cuentas de clientes.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.USER_MANAGE);
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as {
      clientId?: unknown;
    };
    if (typeof body.clientId !== "string") {
      return NextResponse.json({ error: "Selecciona un cliente válido." }, { status: 400 });
    }

    const [client] = await dbModule.db
      .select({
        id: dbModule.schema.clients.id,
        departmentCode: dbModule.schema.clients.codigoDepartamento,
        active: dbModule.schema.clients.activo,
        deletedAt: dbModule.schema.clients.eliminadoEn,
      })
      .from(dbModule.schema.clients)
      .where(eq(dbModule.schema.clients.id, body.clientId))
      .limit(1);
    if (!client || !client.departmentCode?.trim()) {
      return NextResponse.json(
        { error: "El cliente no tiene un código de departamento registrado." },
        { status: 400 },
      );
    }
    const matchingClients = await dbModule.db
      .select({ id: dbModule.schema.clients.id })
      .from(dbModule.schema.clients)
      .where(
        and(
          sql`upper(trim(${dbModule.schema.clients.codigoDepartamento})) = ${client.departmentCode.trim().toUpperCase()}`,
          eq(dbModule.schema.clients.activo, true),
          isNull(dbModule.schema.clients.eliminadoEn),
        ),
      )
      .limit(2);
    if (matchingClients.length > 1) {
      return NextResponse.json(
        { error: "El código de departamento está asignado a más de un cliente activo." },
        { status: 409 },
      );
    }
    const [existing] = await dbModule.db
      .select({ id: dbModule.schema.clientPortalAccounts.id })
      .from(dbModule.schema.clientPortalAccounts)
      .where(eq(dbModule.schema.clientPortalAccounts.clientId, client.id))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: "Este cliente ya tiene una cuenta de portal." }, { status: 409 });
    }

    const currentContract = await findCurrentClientContract(
      dbModule,
      client.id,
      client.departmentCode,
    );
    if (!client.active || client.deletedAt || !currentContract) {
      return NextResponse.json(
        { error: "Solo se puede crear una cuenta con un contrato vigente." },
        { status: 409 },
      );
    }

    const email = clientPortalAuthEmail(client.departmentCode);
    const password = generateClientPassword();
    const created = await createAuthUser(email, password);
    if (!created.created || !created.authUserId) {
      return NextResponse.json({ error: "No se pudo crear la cuenta del portal." }, { status: 409 });
    }
    try {
      const [account] = await dbModule.db
        .insert(dbModule.schema.clientPortalAccounts)
        .values({
          clientId: client.id,
          authUserId: created.authUserId,
          email,
          contractId: currentContract.id,
          credentialPeriodKey: currentContract.periodKey,
          active: true,
          createdBy: auth.user.id,
        })
        .returning({ active: dbModule.schema.clientPortalAccounts.active });
      if (!account) throw new Error("No se pudo guardar la cuenta de clientes.");
      return NextResponse.json(
        { account: { active: account.active, password } },
        { status: 201 },
      );
    } catch (error) {
      await dbModule.db
        .delete(dbModule.schema.clientPortalAccounts)
        .where(eq(dbModule.schema.clientPortalAccounts.authUserId, created.authUserId));
      await deleteAuthUserById(created.authUserId);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la cuenta de clientes.",
      },
      { status: 500 },
    );
  }
}
