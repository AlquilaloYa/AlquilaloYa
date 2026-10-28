import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addSessionCookiesIfRefreshed,
  resolveClientPortalIdentity,
} from "@/lib/client-portal-auth";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const BUCKET = "client-work-order-evidence";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  try {
    const dbModule = await import("@contract/db");
    const session = await resolveClientPortalIdentity(request, dbModule);
    if (!session) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }

    const [clientUpload] = await dbModule.db
      .select({
        storageKey: dbModule.schema.clientPortalUploads.storageKey,
        mimeType: dbModule.schema.clientPortalUploads.mimeType,
        fileName: dbModule.schema.clientPortalUploads.fileName,
        sizeBytes: dbModule.schema.clientPortalUploads.sizeBytes,
      })
      .from(dbModule.schema.clientPortalUploads)
      .where(
        and(
          eq(dbModule.schema.clientPortalUploads.id, params.id),
          eq(
            dbModule.schema.clientPortalUploads.clientId,
            session.identity.client.id,
          ),
        ),
      )
      .limit(1);

    const [workOrderAttachment] = clientUpload
      ? []
      : await dbModule.db
          .select({
            storageKey: dbModule.schema.workOrderAttachments.storageKey,
            mimeType: dbModule.schema.workOrderAttachments.mimeType,
            fileName: dbModule.schema.workOrderAttachments.fileName,
            sizeBytes: dbModule.schema.workOrderAttachments.sizeBytes,
          })
          .from(dbModule.schema.workOrderAttachments)
          .innerJoin(
            dbModule.schema.workOrders,
            eq(
              dbModule.schema.workOrders.id,
              dbModule.schema.workOrderAttachments.workOrderId,
            ),
          )
          .where(
            and(
              eq(dbModule.schema.workOrderAttachments.id, params.id),
              eq(
                dbModule.schema.workOrders.clientId,
                session.identity.client.id,
              ),
            ),
          )
          .limit(1);

    const attachment = clientUpload ?? workOrderAttachment;
    const expectedSizeBytes = attachment
      ? Number(attachment.sizeBytes)
      : Number.NaN;
    if (
      !attachment ||
      !ALLOWED_TYPES.has(attachment.mimeType) ||
      !Number.isSafeInteger(expectedSizeBytes) ||
      expectedSizeBytes < 1 ||
      expectedSizeBytes > 8 * 1024 * 1024
    ) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    const bytes = await downloadObject(attachment.storageKey, BUCKET);
    if (bytes.byteLength !== expectedSizeBytes) {
      console.error("El tamaño del adjunto del portal no coincide con su registro", {
        attachmentId: params.id,
      });
      return NextResponse.json(
        { error: "No se pudo cargar el archivo" },
        { status: 503 },
      );
    }

    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    const response = new NextResponse(responseBytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return addSessionCookiesIfRefreshed(response, session);
  } catch (error) {
    console.error("No se pudo servir el adjunto del portal cliente", error);
    return NextResponse.json(
      { error: "No se pudo cargar el archivo" },
      { status: 503 },
    );
  }
}
