import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";
import {
  matchesLocalFileSignature,
  maxLocalUploadBytes,
} from "@/lib/locales-files";

export const dynamic = "force-dynamic";
const BUCKET = "local-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_TYPES = ["separaciones", "contratos", "adendas"] as const;
type OwnerType = (typeof OWNER_TYPES)[number];
const DOCUMENT_TYPES: Record<OwnerType, readonly string[]> = {
  separaciones: ["VOUCHER_SEPARACION", "VOUCHER_GARANTIA_EXTENDIDA"],
  contratos: ["VOUCHER_GARANTIA", "VOUCHER_PRIMERA_MENSUALIDAD", "CONTRATO_FIRMADO"],
  adendas: ["ADENDA_FIRMADA"],
};

function isOwnerType(value: string | null): value is OwnerType {
  return OWNER_TYPES.some((type) => type === value);
}

function parentFilter(
  schema: typeof import("@contract/db").schema,
  ownerType: OwnerType,
  ownerId: string,
) {
  const parent =
    ownerType === "separaciones"
      ? schema.localContractDocuments.separationId
      : ownerType === "contratos"
        ? schema.localContractDocuments.contractId
        : schema.localContractDocuments.annexId;
  return eq(parent, ownerId);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const localId = url.searchParams.get("localId");
    const ownerId = url.searchParams.get("ownerId");
    const ownerType = url.searchParams.get("ownerType");
    if (!localId || !UUID.test(localId) || !ownerId || !UUID.test(ownerId) || !isOwnerType(ownerType)) {
      return NextResponse.json({ error: "Selecciona un registro válido para cargar sus documentos." }, { status: 400 });
    }

    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const rows = await dbModule.db
      .select({
        id: dbModule.schema.localContractDocuments.id,
        tipo: dbModule.schema.localContractDocuments.tipo,
        nombre: dbModule.schema.localContractDocuments.nombre,
        mimeType: dbModule.schema.localContractDocuments.mimeType,
        sizeBytes: dbModule.schema.localContractDocuments.sizeBytes,
        createdAt: dbModule.schema.localContractDocuments.createdAt,
      })
      .from(dbModule.schema.localContractDocuments)
      .where(and(
        eq(dbModule.schema.localContractDocuments.localId, localId),
        parentFilter(dbModule.schema, ownerType, ownerId),
      ))
      .orderBy(asc(dbModule.schema.localContractDocuments.createdAt));
    const response = NextResponse.json(rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      url: `/api/locales/documentos/${row.id}`,
    })));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("[locales] list contract documents failed", error);
    return NextResponse.json({ error: "No se pudieron cargar los documentos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;
    if (!isStorageConfigured()) {
      return NextResponse.json({ error: "El almacenamiento privado no está configurado." }, { status: 503 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
    }
    const localId = String(form.get("localId") ?? "");
    const ownerId = String(form.get("ownerId") ?? "");
    const ownerTypeRaw = String(form.get("ownerType") ?? "");
    const tipo = String(form.get("tipo") ?? "");
    const file = form.get("file");
    if (!UUID.test(localId) || !UUID.test(ownerId) || !isOwnerType(ownerTypeRaw)) {
      return NextResponse.json({ error: "Selecciona un registro válido para adjuntar el documento." }, { status: 400 });
    }
    const ownerType = ownerTypeRaw;
    if (!DOCUMENT_TYPES[ownerType].includes(tipo)) {
      return NextResponse.json({ error: "El tipo de documento no corresponde a este registro." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Selecciona un archivo." }, { status: 400 });
    }
    const maxBytes = maxLocalUploadBytes(file.type);
    if (maxBytes === null) {
      return NextResponse.json({ error: "Solo se admiten PDF, JPG, PNG y WebP." }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `El archivo no puede superar ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const parentTable =
      ownerType === "separaciones"
        ? dbModule.schema.localSeparations
        : ownerType === "contratos"
          ? dbModule.schema.localContracts
          : dbModule.schema.localAnnexes;
    const [parent] = await dbModule.db
      .select({ id: parentTable.id })
      .from(parentTable)
      .where(and(eq(parentTable.id, ownerId), eq(parentTable.localId, localId)))
      .limit(1);
    if (!parent) return NextResponse.json({ error: "El registro no pertenece al local seleccionado." }, { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesLocalFileSignature(file.type, bytes)) {
      return NextResponse.json({ error: "El contenido no coincide con el tipo de archivo indicado." }, { status: 400 });
    }
    const ext = file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : "webp";
    const id = randomUUID();
    const stored = await uploadObject(
      `${localId}/documentos/${ownerType}/${ownerId}/${id}.${ext}`,
      bytes,
      file.type,
      BUCKET,
    );
    uploadedKey = stored.key;

    const [row] = await dbModule.db
      .insert(dbModule.schema.localContractDocuments)
      .values({
        id,
        localId,
        separationId: ownerType === "separaciones" ? ownerId : null,
        contractId: ownerType === "contratos" ? ownerId : null,
        annexId: ownerType === "adendas" ? ownerId : null,
        tipo,
        nombre: file.name.slice(0, 255),
        storageKey: stored.key,
        mimeType: file.type,
        sizeBytes: stored.sizeBytes,
        uploadedBy: auth.user.name || auth.user.email,
      })
      .returning({
        id: dbModule.schema.localContractDocuments.id,
        tipo: dbModule.schema.localContractDocuments.tipo,
        nombre: dbModule.schema.localContractDocuments.nombre,
        mimeType: dbModule.schema.localContractDocuments.mimeType,
        sizeBytes: dbModule.schema.localContractDocuments.sizeBytes,
        createdAt: dbModule.schema.localContractDocuments.createdAt,
      });
    if (!row) throw new Error("No se pudo registrar el documento.");
    uploadedKey = null;
    return NextResponse.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      url: `/api/locales/documentos/${row.id}`,
    }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error("[locales] orphan document cleanup failed", cleanupError);
      }
    }
    console.error("[locales] upload contract document failed", error);
    return NextResponse.json({ error: "No se pudo guardar el documento." }, { status: 500 });
  }
}
