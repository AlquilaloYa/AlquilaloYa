import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";
import {
  matchesLocalFileSignature,
  maxLocalUploadBytes,
} from "@/lib/locales-files";

export const dynamic = "force-dynamic";
const BUCKET = "local-assets";
const MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!UUID.test(params.id)) {
      return NextResponse.json({ error: "Identificador de local inválido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;
    const rows = await dbModule.db
      .select({
        id: dbModule.schema.localFiles.id,
        nombre: dbModule.schema.localFiles.nombre,
        mimeType: dbModule.schema.localFiles.mimeType,
        sizeBytes: dbModule.schema.localFiles.sizeBytes,
        createdAt: dbModule.schema.localFiles.createdAt,
      })
      .from(dbModule.schema.localFiles)
      .where(eq(dbModule.schema.localFiles.localId, params.id))
      .orderBy(asc(dbModule.schema.localFiles.createdAt));
    const response = NextResponse.json(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        url: `/api/locales/${params.id}/archivos/${row.id}`,
      })),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[locales] list attachments failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los archivos del local." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let uploadedKey: string | null = null;
  try {
    if (!UUID.test(params.id)) {
      return NextResponse.json({ error: "Identificador de local inválido." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: "El almacenamiento privado no está configurado." },
        { status: 503 },
      );
    }

    const [local] = await dbModule.db
      .select({ id: dbModule.schema.locales.id })
      .from(dbModule.schema.locales)
      .where(eq(dbModule.schema.locales.id, params.id))
      .limit(1);
    if (!local) {
      return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Selecciona un archivo." }, { status: 400 });
    }
    if (!MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Solo se admiten PDF, JPG, PNG y WebP." },
        { status: 400 },
      );
    }
    const maxBytes = maxLocalUploadBytes(file.type);
    if (maxBytes === null || file.size > maxBytes) {
      const maxMegabytes = maxBytes ? maxBytes / 1024 / 1024 : 0;
      return NextResponse.json(
        { error: `El archivo optimizado debe pesar como máximo ${maxMegabytes} MB.` },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesLocalFileSignature(file.type, bytes)) {
      return NextResponse.json(
        { error: "El contenido no coincide con el tipo de archivo indicado." },
        { status: 400 },
      );
    }
    const ext = file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : "webp";
    const id = randomUUID();
    const storageKey = `${params.id}/${id}.${ext}`;
    const stored = await uploadObject(storageKey, bytes, file.type, BUCKET);
    uploadedKey = stored.key;
    const [row] = await dbModule.db
      .insert(dbModule.schema.localFiles)
      .values({
        id,
        localId: params.id,
        nombre: file.name.slice(0, 255),
        storageKey: stored.key,
        mimeType: file.type,
        sizeBytes: stored.sizeBytes,
        uploadedBy: auth.user.name || auth.user.email,
      })
      .returning({
        id: dbModule.schema.localFiles.id,
        nombre: dbModule.schema.localFiles.nombre,
        mimeType: dbModule.schema.localFiles.mimeType,
        sizeBytes: dbModule.schema.localFiles.sizeBytes,
        createdAt: dbModule.schema.localFiles.createdAt,
      });
    if (!row) throw new Error("No se pudo registrar el archivo del local.");
    uploadedKey = null;
    return NextResponse.json(
      {
        ...row,
        createdAt: row.createdAt.toISOString(),
        url: `/api/locales/${params.id}/archivos/${row.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error("[locales] orphaned upload cleanup failed", cleanupError);
      }
    }
    console.error("[locales] upload attachment failed", error);
    return NextResponse.json(
      { error: "No se pudo guardar el archivo del local." },
      { status: 500 },
    );
  }
}
