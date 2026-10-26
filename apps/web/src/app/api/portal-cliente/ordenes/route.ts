import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { AccessControl, Permission } from "@contract/domain/rbac";
import {
  addSessionCookiesIfRefreshed,
  resolveClientPortalIdentity,
  sameOriginRequest,
} from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { createSignedObjectUrl, deleteObject, downloadObject } from "@/lib/storage";
import { notificationRows } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const BUCKET = "client-work-order-evidence";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;
const VISIT_WINDOW_MS = 2 * 60 * 60 * 1000;

type AvailabilityOption = { startsAt: Date; endsAt: Date };
type VerifiedUpload = {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function siteFromDepartmentCode(code: string): "Angamos" | "Benavides" | null {
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("ANG170")) return "Angamos";
  if (normalized.startsWith("BEN2195")) return "Benavides";
  return null;
}

function parseAvailability(value: unknown): AvailabilityOption[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const options: AvailabilityOption[] = [];
  const now = Date.now();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.startsAt !== "string" || typeof candidate.endsAt !== "string") {
      return null;
    }
    const startsAt = new Date(candidate.startsAt);
    const endsAt = new Date(candidate.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt.getTime() <= now ||
      endsAt.getTime() - startsAt.getTime() !== VISIT_WINDOW_MS
    ) {
      return null;
    }
    options.push({ startsAt, endsAt });
  }
  if (new Set(options.map(({ startsAt }) => startsAt.getTime())).size !== 3) {
    return null;
  }
  return options;
}

function hasValidFileSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (mimeType === "video/mp4") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  if (mimeType === "video/webm") {
    return bytes.length >= 4 &&
      bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    const rows = await dbModule.db
      .select({
        id: dbModule.schema.workOrders.id,
        code: dbModule.schema.workOrders.code,
        title: dbModule.schema.workOrders.title,
        description: dbModule.schema.workOrders.description,
        issueType: dbModule.schema.workOrders.issueType,
        status: dbModule.schema.workOrders.status,
        customerPresentAtVisit: dbModule.schema.workOrders.customerPresentAtVisit,
        createdAt: dbModule.schema.workOrders.createdAt,
        updatedAt: dbModule.schema.workOrders.updatedAt,
        completedAt: dbModule.schema.workOrders.completedAt,
      })
      .from(dbModule.schema.workOrders)
      .where(eq(dbModule.schema.workOrders.clientId, session.identity.client.id))
      .orderBy(desc(dbModule.schema.workOrders.createdAt))
      .limit(50);

    const orders = await Promise.all(
      rows.map(async (order) => {
        const [events, availability, attachments, chat] = await Promise.all([
          dbModule.db
            .select({
              eventType: dbModule.schema.workOrderEvents.eventType,
              fromStatus: dbModule.schema.workOrderEvents.fromStatus,
              toStatus: dbModule.schema.workOrderEvents.toStatus,
              actorName: dbModule.schema.workOrderEvents.actorName,
              createdAt: dbModule.schema.workOrderEvents.createdAt,
            })
            .from(dbModule.schema.workOrderEvents)
            .where(eq(dbModule.schema.workOrderEvents.workOrderId, order.id))
            .orderBy(asc(dbModule.schema.workOrderEvents.createdAt)),
          dbModule.db
            .select({
              id: dbModule.schema.workOrderAvailabilityOptions.id,
              optionNumber: dbModule.schema.workOrderAvailabilityOptions.optionNumber,
              startsAt: dbModule.schema.workOrderAvailabilityOptions.startsAt,
              endsAt: dbModule.schema.workOrderAvailabilityOptions.endsAt,
              selectedAt: dbModule.schema.workOrderAvailabilityOptions.selectedAt,
            })
            .from(dbModule.schema.workOrderAvailabilityOptions)
            .where(eq(dbModule.schema.workOrderAvailabilityOptions.workOrderId, order.id))
            .orderBy(asc(dbModule.schema.workOrderAvailabilityOptions.optionNumber)),
          dbModule.db
            .select({
              id: dbModule.schema.workOrderAttachments.id,
              fileName: dbModule.schema.workOrderAttachments.fileName,
              mimeType: dbModule.schema.workOrderAttachments.mimeType,
              sizeBytes: dbModule.schema.workOrderAttachments.sizeBytes,
              storageKey: dbModule.schema.workOrderAttachments.storageKey,
            })
            .from(dbModule.schema.workOrderAttachments)
            .where(eq(dbModule.schema.workOrderAttachments.workOrderId, order.id)),
          dbModule.db
            .select({
              id: dbModule.schema.workOrderChats.id,
              openedAt: dbModule.schema.workOrderChats.openedAt,
              closedAt: dbModule.schema.workOrderChats.closedAt,
            })
            .from(dbModule.schema.workOrderChats)
            .where(eq(dbModule.schema.workOrderChats.workOrderId, order.id))
            .limit(1),
        ]);
        return {
          ...order,
          events,
          availability,
          attachments: await Promise.all(
            attachments.map(async ({ storageKey, ...attachment }) => ({
              ...attachment,
              url: await createSignedObjectUrl(storageKey, BUCKET),
            })),
          ),
          chat: chat[0] ?? null,
        };
      }),
    );
    const requestRows = await dbModule.db
      .select({
        id: dbModule.schema.clientWorkOrderRequests.id,
        issueType: dbModule.schema.clientWorkOrderRequests.issueType,
        description: dbModule.schema.clientWorkOrderRequests.description,
        status: dbModule.schema.clientWorkOrderRequests.status,
        availabilityOptions: dbModule.schema.clientWorkOrderRequests.availabilityOptions,
        workOrderId: dbModule.schema.clientWorkOrderRequests.workOrderId,
        createdAt: dbModule.schema.clientWorkOrderRequests.createdAt,
      })
      .from(dbModule.schema.clientWorkOrderRequests)
      .where(eq(dbModule.schema.clientWorkOrderRequests.clientId, session.identity.client.id))
      .orderBy(desc(dbModule.schema.clientWorkOrderRequests.createdAt))
      .limit(50);
    const requests = await Promise.all(
      requestRows.map(async (clientRequest) => {
        const attachments = await dbModule.db
          .select({
            id: dbModule.schema.clientPortalUploads.id,
            fileName: dbModule.schema.clientPortalUploads.fileName,
            mimeType: dbModule.schema.clientPortalUploads.mimeType,
            sizeBytes: dbModule.schema.clientPortalUploads.sizeBytes,
            storageKey: dbModule.schema.clientPortalUploads.storageKey,
          })
          .from(dbModule.schema.clientPortalUploads)
          .where(eq(dbModule.schema.clientPortalUploads.requestId, clientRequest.id));
        return {
          ...clientRequest,
          attachments: await Promise.all(
            attachments.map(async ({ storageKey, ...attachment }) => ({
              ...attachment,
              url: await createSignedObjectUrl(storageKey, BUCKET),
            })),
          ),
        };
      }),
    );
    const response = NextResponse.json({ orders, requests });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json({ error: "No fue posible consultar tus reportes." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  try {
    if (!(await checkClientPortalLimit(`report:${clientIp(request.headers)}`, 5, 60 * 60_000))) {
      return NextResponse.json({ error: "Has enviado varios reportes. Inténtalo más tarde." }, { status: 429 });
    }
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
    }
    const values = body as Record<string, unknown>;
    const issueType = typeof values.issueType === "string" ? values.issueType.trim() : "";
    const description = typeof values.description === "string" ? values.description.trim() : "";
    const customerPresentAtVisit = values.customerPresentAtVisit;
    const availability = parseAvailability(values.availability);
    const attachmentIds = values.attachmentIds;
    if (
      !issueType ||
      issueType.length > 80 ||
      !description ||
      description.length > 10_000 ||
      typeof customerPresentAtVisit !== "boolean" ||
      !availability ||
      !Array.isArray(attachmentIds) ||
      attachmentIds.length > 5 ||
      attachmentIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
      new Set(attachmentIds).size !== attachmentIds.length
    ) {
      return NextResponse.json(
        { error: "Revisa el problema, la disponibilidad y los archivos adjuntos." },
        { status: 400 },
      );
    }

    const [department] = await dbModule.db
      .select({
        id: dbModule.schema.departments.id,
        code: dbModule.schema.departments.codigo,
        active: dbModule.schema.departments.activo,
      })
      .from(dbModule.schema.departments)
      .where(
        and(
          sql`upper(trim(${dbModule.schema.departments.codigo})) = ${session.identity.client.departmentCode.trim().toUpperCase()}`,
          eq(dbModule.schema.departments.activo, true),
        ),
      )
      .limit(1);
    const site = department ? siteFromDepartmentCode(department.code) : null;
    if (!department || !site) {
      return NextResponse.json(
        { error: "El departamento asociado a tu cuenta no está habilitado para reportes." },
        { status: 400 },
      );
    }

    const uploads = attachmentIds.length
      ? await dbModule.db
          .select()
          .from(dbModule.schema.clientPortalUploads)
          .where(
            and(
              inArray(dbModule.schema.clientPortalUploads.id, attachmentIds as string[]),
              eq(dbModule.schema.clientPortalUploads.clientId, session.identity.client.id),
              isNull(dbModule.schema.clientPortalUploads.requestId),
              isNull(dbModule.schema.clientPortalUploads.workOrderId),
            ),
          )
      : [];
    if (uploads.length !== attachmentIds.length) {
      return NextResponse.json({ error: "Uno o más archivos no están disponibles." }, { status: 400 });
    }
    const verifiedUploads: VerifiedUpload[] = [];
    for (const upload of uploads) {
      if (
        Date.now() - upload.createdAt.getTime() > MAX_FILE_AGE_MS ||
        upload.sizeBytes > 8 * 1024 * 1024
      ) {
        return NextResponse.json({ error: "Un archivo venció o excede el límite permitido." }, { status: 400 });
      }
      const bytes = await downloadObject(upload.storageKey, BUCKET);
      if (
        bytes.byteLength !== upload.sizeBytes ||
        !hasValidFileSignature(upload.mimeType, bytes)
      ) {
        return NextResponse.json({ error: "Un archivo no coincide con su formato declarado." }, { status: 400 });
      }
      verifiedUploads.push({
        id: upload.id,
        storageKey: upload.storageKey,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: bytes.byteLength,
      });
    }

    const id = randomUUID();
    const now = new Date();
    try {
      const clientRequest = await dbModule.db.transaction(async (tx) => {
        if (verifiedUploads.length) {
          const claimed = await tx
            .update(dbModule.schema.clientPortalUploads)
            .set({ requestId: id })
            .where(
              and(
                inArray(
                  dbModule.schema.clientPortalUploads.id,
                  verifiedUploads.map((upload) => upload.id),
                ),
                eq(dbModule.schema.clientPortalUploads.clientId, session.identity.client.id),
                isNull(dbModule.schema.clientPortalUploads.requestId),
                isNull(dbModule.schema.clientPortalUploads.workOrderId),
              ),
            )
            .returning({ id: dbModule.schema.clientPortalUploads.id });
          if (claimed.length !== verifiedUploads.length) {
            throw new Error("Un archivo ya fue usado en otro reporte");
          }
        }
        const [created] = await tx
          .insert(dbModule.schema.clientWorkOrderRequests)
          .values({
            id,
            clientId: session.identity.client.id,
            departmentId: department.id,
            issueType,
            description,
            customerPresentAtVisit,
            availabilityOptions: availability.map((option) => ({
              startsAt: option.startsAt.toISOString(),
              endsAt: option.endsAt.toISOString(),
            })),
            status: "PENDING",
            createdAt: now,
            updatedAt: now,
          })
          .returning({
            id: dbModule.schema.clientWorkOrderRequests.id,
            issueType: dbModule.schema.clientWorkOrderRequests.issueType,
            status: dbModule.schema.clientWorkOrderRequests.status,
            createdAt: dbModule.schema.clientWorkOrderRequests.createdAt,
          });
        if (!created) throw new Error("No se pudo guardar la solicitud de mantenimiento");
        const [activeUsers, additionalWorkOrderReaders] = await Promise.all([
          tx
            .select({
              id: dbModule.schema.users.id,
              role: dbModule.schema.users.role,
            })
            .from(dbModule.schema.users)
            .where(eq(dbModule.schema.users.active, true)),
          tx
            .select({ userId: dbModule.schema.userPermissions.userId })
            .from(dbModule.schema.userPermissions)
            .innerJoin(
              dbModule.schema.permissions,
              eq(
                dbModule.schema.userPermissions.permissionId,
                dbModule.schema.permissions.id,
              ),
            )
            .where(
              eq(
                dbModule.schema.permissions.key,
                Permission.WORK_ORDER_READ,
              ),
            ),
        ]);
        const additionalReaderIds = new Set(
          additionalWorkOrderReaders.map(({ userId }) => userId),
        );
        const recipients = activeUsers.filter((user) =>
          AccessControl.forRole(
            user.role,
            additionalReaderIds.has(user.id) ? [Permission.WORK_ORDER_READ] : [],
          ).can(Permission.WORK_ORDER_READ),
        );
        if (recipients.length) {
          await tx.insert(dbModule.schema.notifications).values(
            notificationRows(
              recipients.map((recipient) => recipient.id),
              {
                type: "CLIENT_REQUEST_NEW",
                title: "Nueva solicitud de mantenimiento",
                body: `${issueType} · ${session.identity.client.names} · ${department.code}`,
                href: "/pedidos-clientes",
                entityType: "CLIENT_REQUEST",
                entityId: id,
                dedupeKey: `client-request:${id}`,
              },
            ),
          );
        }
        return created;
      });
      const response = NextResponse.json({ request: clientRequest }, { status: 201 });
      response.headers.set("Cache-Control", "no-store");
      return addSessionCookiesIfRefreshed(response, session);
    } catch (error) {
      const cleanupErrors: string[] = [];
      for (const upload of verifiedUploads) {
        try {
          await deleteObject(upload.storageKey, BUCKET);
        } catch (cleanupError) {
          cleanupErrors.push(
            cleanupError instanceof Error ? cleanupError.message : "Error al eliminar el archivo",
          );
        }
      }
      await dbModule.db
        .delete(dbModule.schema.clientPortalUploads)
        .where(
          and(
            inArray(
              dbModule.schema.clientPortalUploads.id,
              verifiedUploads.map((upload) => upload.id),
            ),
            eq(dbModule.schema.clientPortalUploads.clientId, session.identity.client.id),
          ),
        );
      if (cleanupErrors.length) {
        console.error("Error limpiando archivos de reporte fallido", {
          error: error instanceof Error ? error.message : "Error desconocido",
          cleanupErrors,
        });
      }
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "No se pudo guardar la solicitud de mantenimiento.",
        },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No fue posible crear el reporte. Inténtalo más tarde." },
      { status: 503 },
    );
  }
}
