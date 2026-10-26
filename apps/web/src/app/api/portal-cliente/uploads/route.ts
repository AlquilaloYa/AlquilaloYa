import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { addSessionCookiesIfRefreshed, resolveClientPortalIdentity, sameOriginRequest } from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { createSignedUploadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const BUCKET = "client-work-order-evidence";
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function cleanFileName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return normalized || "evidencia";
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  try {
    if (!(await checkClientPortalLimit(`upload:${clientIp(request.headers)}`, 20, 10 * 60_000))) {
      return NextResponse.json({ error: "Demasiadas cargas. Inténtalo más tarde." }, { status: 429 });
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
    const { fileName, mimeType, sizeBytes } = body as Record<string, unknown>;
    if (
      typeof fileName !== "string" ||
      fileName.length > 255 ||
      typeof mimeType !== "string" ||
      !ALLOWED_TYPES.has(mimeType) ||
      typeof sizeBytes !== "number" ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > 8 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "Archivo no válido. Se permiten fotos o videos de hasta 8 MB." },
        { status: 400 },
      );
    }

    const id = randomUUID();
    const safeName = cleanFileName(fileName);
    const key = `${session.identity.client.id}/${id}/${safeName}`;
    await dbModule.db.insert(dbModule.schema.clientPortalUploads).values({
      id,
      clientId: session.identity.client.id,
      storageKey: key,
      fileName: safeName,
      mimeType,
      sizeBytes,
    });
    let signedUrl: string;
    try {
      signedUrl = await createSignedUploadUrl(key, BUCKET);
    } catch (error) {
      await dbModule.db
        .delete(dbModule.schema.clientPortalUploads)
        .where(
          and(
            eq(dbModule.schema.clientPortalUploads.id, id),
            eq(dbModule.schema.clientPortalUploads.clientId, session.identity.client.id),
            isNull(dbModule.schema.clientPortalUploads.workOrderId),
          ),
        );
      throw error;
    }

    const response = NextResponse.json({ uploadId: id, signedUrl }, { status: 201 });
    response.headers.set("Cache-Control", "no-store");
    return addSessionCookiesIfRefreshed(response, session);
  } catch {
    return NextResponse.json(
      { error: "No fue posible preparar la carga del archivo." },
      { status: 503 },
    );
  }
}
