import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  decryptClientChatMessage,
  encryptClientChatMessage,
} from "@contract/db";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { sameOriginRequest } from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSED_STATUSES = ["COMPLETED", "CANCELLED"];

async function authorizeOrder(
  dbModule: typeof import("@contract/db"),
  request: Request,
  orderId: string,
  permission: Permission,
) {
  const auth = await requireUser(dbModule, request);
  if ("error" in auth) return { response: auth.error } as const;
  const denied = requirePermission(auth.user, permission);
  if (denied) return { response: denied } as const;
  const [order] = await dbModule.db
    .select({
      id: dbModule.schema.workOrders.id,
      status: dbModule.schema.workOrders.status,
      assignedEmployeeId: dbModule.schema.workOrders.assignedEmployeeId,
      customerPresentAtVisit: dbModule.schema.workOrders.customerPresentAtVisit,
    })
    .from(dbModule.schema.workOrders)
    .where(eq(dbModule.schema.workOrders.id, orderId))
    .limit(1);
  if (!order) {
    return {
      response: NextResponse.json({ error: "Orden no encontrada" }, { status: 404 }),
    } as const;
  }
  if (
    auth.user.role === "ASISTENTE_ADMINISTRATIVO" ||
    auth.user.role === "MANTENIMIENTO"
  ) {
    const [employee] = await dbModule.db
      .select({ id: dbModule.schema.hrEmployees.id })
      .from(dbModule.schema.hrEmployees)
      .where(
        and(
          eq(dbModule.schema.hrEmployees.userId, auth.user.id),
          eq(dbModule.schema.hrEmployees.estado, "ACTIVO"),
          isNull(dbModule.schema.hrEmployees.deletedAt),
        ),
      )
      .limit(1);
    if (!employee || order.assignedEmployeeId !== employee.id) {
      return {
        response: NextResponse.json({ error: "Orden no encontrada" }, { status: 404 }),
      } as const;
    }
  }
  return { auth, order } as const;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: "Identificador no válido" }, { status: 400 });
  }
  try {
    const dbModule = await import("@contract/db");
    const authorized = await authorizeOrder(
      dbModule,
      request,
      params.id,
      Permission.WORK_ORDER_READ,
    );
    if ("response" in authorized) return authorized.response;
    const [chat] = await dbModule.db
      .select()
      .from(dbModule.schema.workOrderChats)
      .where(eq(dbModule.schema.workOrderChats.workOrderId, params.id))
      .limit(1);
    const messages = chat
      ? await dbModule.db
          .select()
          .from(dbModule.schema.workOrderChatMessages)
          .where(eq(dbModule.schema.workOrderChatMessages.chatId, chat.id))
          .orderBy(asc(dbModule.schema.workOrderChatMessages.createdAt))
      : [];
    const response = NextResponse.json({
      chat: chat ? { openedAt: chat.openedAt, closedAt: chat.closedAt } : null,
      messages: messages.map(({ encryptedContent, ...message }) => ({
        ...message,
        content: decryptClientChatMessage(encryptedContent),
      })),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
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
    const authorized = await authorizeOrder(
      dbModule,
      request,
      params.id,
      Permission.WORK_ORDER_UPDATE,
    );
    if ("response" in authorized) return authorized.response;
    const { order, auth } = authorized;
    if (
      order.customerPresentAtVisit ||
      CLOSED_STATUSES.includes(order.status) ||
      !["ON_SITE", "DIAGNOSIS", "ESTIMATED", "IN_PROGRESS", "RESOLVED", "PENDING_CLOSURE"].includes(order.status)
    ) {
      return NextResponse.json(
        { error: "El chat solo se habilita al llegar mantenimiento cuando el cliente no está presente" },
        { status: 409 },
      );
    }
    if (!(await checkClientPortalLimit(`employee-chat:${auth.user.id}`, 30, 10 * 60_000))) {
      return NextResponse.json({ error: "Enviaste muchos mensajes. Inténtalo más tarde." }, { status: 429 });
    }

    const [existing] = await dbModule.db
      .select()
      .from(dbModule.schema.workOrderChats)
      .where(eq(dbModule.schema.workOrderChats.workOrderId, order.id))
      .limit(1);
    if (existing?.closedAt) {
      return NextResponse.json({ error: "El chat de esta orden ya fue cerrado" }, { status: 409 });
    }
    let chat = existing;
    if (!chat) {
      const [opened] = await dbModule.db
        .insert(dbModule.schema.workOrderChats)
        .values({ workOrderId: order.id, openedAt: new Date() })
        .onConflictDoNothing({
          target: dbModule.schema.workOrderChats.workOrderId,
        })
        .returning();
      chat = opened;
      if (!chat) {
        const [concurrentChat] = await dbModule.db
          .select()
          .from(dbModule.schema.workOrderChats)
          .where(eq(dbModule.schema.workOrderChats.workOrderId, order.id))
          .limit(1);
        chat = concurrentChat;
      }
    }
    if (!chat || chat.closedAt) {
      return NextResponse.json({ error: "El chat no está disponible" }, { status: 409 });
    }
    const [message] = await dbModule.db
      .insert(dbModule.schema.workOrderChatMessages)
      .values({
        chatId: chat.id,
        senderType: "EMPLOYEE",
        senderId: auth.user.id,
        senderName: auth.user.name,
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
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 503 });
  }
}
