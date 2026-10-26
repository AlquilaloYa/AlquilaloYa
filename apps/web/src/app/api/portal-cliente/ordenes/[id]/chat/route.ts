import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { decryptClientChatMessage, encryptClientChatMessage } from "@contract/db";
import {
  addSessionCookiesIfRefreshed,
  resolveClientPortalIdentity,
  sameOriginRequest,
} from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  }
  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });

    const [order] = await dbModule.db
      .select({ id: dbModule.schema.workOrders.id })
      .from(dbModule.schema.workOrders)
      .where(
        and(
          eq(dbModule.schema.workOrders.id, params.id),
          eq(dbModule.schema.workOrders.clientId, session.identity.client.id),
        ),
      )
      .limit(1);
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

    const [chat] = await dbModule.db
      .select()
      .from(dbModule.schema.workOrderChats)
      .where(eq(dbModule.schema.workOrderChats.workOrderId, order.id))
      .limit(1);
    if (!chat) {
      const response = NextResponse.json({ chat: null, messages: [] });
      response.headers.set("Cache-Control", "no-store");
      return addSessionCookiesIfRefreshed(response, session);
    }
    const messages = await dbModule.db
      .select()
      .from(dbModule.schema.workOrderChatMessages)
      .where(eq(dbModule.schema.workOrderChatMessages.chatId, chat.id))
      .orderBy(asc(dbModule.schema.workOrderChatMessages.createdAt));
    const response = NextResponse.json({
      chat: { openedAt: chat.openedAt, closedAt: chat.closedAt },
      messages: messages.map(({ encryptedContent, ...message }) => ({
        ...message,
        content: decryptClientChatMessage(encryptedContent),
      })),
    });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el chat" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const content =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).content === "string"
      ? (body as { content: string }).content.trim()
      : "";
  if (!content || content.length > 2000) {
    return NextResponse.json({ error: "El mensaje debe tener entre 1 y 2000 caracteres" }, { status: 400 });
  }

  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    if (!(await checkClientPortalLimit(`client-chat:${session.identity.client.id}`, 30, 10 * 60_000))) {
      return NextResponse.json({ error: "Enviaste muchos mensajes. Inténtalo más tarde." }, { status: 429 });
    }

    const [order] = await dbModule.db
      .select({
        id: dbModule.schema.workOrders.id,
        customerPresentAtVisit: dbModule.schema.workOrders.customerPresentAtVisit,
        status: dbModule.schema.workOrders.status,
      })
      .from(dbModule.schema.workOrders)
      .where(
        and(
          eq(dbModule.schema.workOrders.id, params.id),
          eq(dbModule.schema.workOrders.clientId, session.identity.client.id),
        ),
      )
      .limit(1);
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    if (
      order.customerPresentAtVisit ||
      ["COMPLETED", "CANCELLED"].includes(order.status)
    ) {
      return NextResponse.json({ error: "El chat no está disponible para este pedido" }, { status: 409 });
    }

    const [chat] = await dbModule.db
      .select()
      .from(dbModule.schema.workOrderChats)
      .where(eq(dbModule.schema.workOrderChats.workOrderId, order.id))
      .limit(1);
    if (!chat || chat.closedAt) {
      return NextResponse.json({ error: "El chat se habilitará cuando mantenimiento llegue al departamento" }, { status: 409 });
    }
    const [message] = await dbModule.db
      .insert(dbModule.schema.workOrderChatMessages)
      .values({
        chatId: chat.id,
        senderType: "CLIENT",
        senderId: session.identity.client.id,
        senderName: session.identity.client.names,
        encryptedContent: encryptClientChatMessage(content),
      })
      .returning();
    if (!message) throw new Error("No se pudo guardar el mensaje");
    const response = NextResponse.json({
      message: {
        id: message.id,
        senderType: message.senderType,
        senderName: message.senderName,
        createdAt: message.createdAt,
        content,
      },
    }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 503 });
  }
}
