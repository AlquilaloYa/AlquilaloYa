import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buscarClienteNotariadoPorId } from "@/lib/client-phone-match";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as { leadId?: string; clientId?: string };
    if (!body.leadId || !body.clientId) {
      return NextResponse.json({ error: "Selecciona el lead y el cliente" }, { status: 400 });
    }

    const client = await buscarClienteNotariadoPorId(db, schema, body.clientId);
    if (!client) {
      return NextResponse.json(
        { error: "El cliente debe tener un contrato notariado y su contrato adjunto para recibir la conversación" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(schema.conversations)
      .set({ clientId: client.id, updatedAt: new Date() })
      .where(eq(schema.conversations.leadId, body.leadId))
      .returning({ id: schema.conversations.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: "Este lead no tiene conversaciones para derivar" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversations: updated.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
