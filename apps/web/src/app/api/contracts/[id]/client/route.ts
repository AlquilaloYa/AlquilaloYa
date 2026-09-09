import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
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

    return NextResponse.json({
      id: contract.cliente.id,
      nombres: contract.cliente.nombres,
      apellidos: contract.cliente.apellidos,
      activo: contract.cliente.activo,
      registrado: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
