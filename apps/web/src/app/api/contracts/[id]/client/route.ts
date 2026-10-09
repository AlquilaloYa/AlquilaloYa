import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");
    const [contract] = await db
      .select({
        clienteId: schema.clients.id,
        registrado: schema.clients.activo,
      })
      .from(schema.contracts)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .where(eq(schema.contracts.id, params.id))
      .limit(1);

    if (!contract) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ registrado: contract.registrado });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const [contract] = await db
      .select({
        estado: schema.contracts.estado,
        cliente: schema.clients,
      })
      .from(schema.contracts)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .where(eq(schema.contracts.id, params.id))
      .limit(1);

    if (!contract) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }
    if (!["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE", "RENOVADO"].includes(contract.estado)) {
      return NextResponse.json(
        { error: "El contrato debe estar firmado antes de registrar al cliente" },
        { status: 400 }
      );
    }

    if (!contract.cliente.activo) {
      await db
        .update(schema.clients)
        .set({ activo: true, updatedAt: new Date() })
        .where(eq(schema.clients.id, contract.cliente.id));
    }

    return NextResponse.json({
      id: contract.cliente.id,
      nombres: contract.cliente.nombres,
      apellidos: contract.cliente.apellidos,
      activo: true,
      registrado: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
