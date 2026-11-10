import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { deleteObject, downloadObject, isStorageConfigured, uploadObject } from "@/lib/storage";
import { matchesLocalFileSignature, maxLocalUploadBytes } from "@/lib/locales-files";

export const dynamic = "force-dynamic";
// Bucket dedicado a vouchers de pagos (PDF + imágenes); el bucket "contracts"
// solo admite PDF y rechaza los JPG/PNG con 415 invalid_mime_type.
const BUCKET = "vouchers";

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Tipo de archivo no admitido.");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const [service] = await dbModule.db
      .select({
        voucherStorageKey: dbModule.schema.serviciosExtras.voucherStorageKey,
        voucherFilename: dbModule.schema.serviciosExtras.voucherFilename,
        voucherMimeType: dbModule.schema.serviciosExtras.voucherMimeType,
      })
      .from(dbModule.schema.serviciosExtras)
      .where(eq(dbModule.schema.serviciosExtras.id, id))
      .limit(1);
    if (!service) {
      return NextResponse.json({ error: "Servicio extra no encontrado." }, { status: 404 });
    }
    if (!service.voucherStorageKey || !service.voucherMimeType) {
      return NextResponse.json({ error: "Este servicio extra no tiene voucher." }, { status: 404 });
    }

    const bytes = await downloadObject(service.voucherStorageKey, BUCKET);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": service.voucherMimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(service.voucherFilename ?? "voucher")}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo obtener el voucher." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let uploadedKey: string | null = null;
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: "El almacenamiento privado no está configurado." },
        { status: 503 },
      );
    }

    const [service] = await dbModule.db
      .select({
        id: dbModule.schema.serviciosExtras.id,
        voucherStorageKey: dbModule.schema.serviciosExtras.voucherStorageKey,
      })
      .from(dbModule.schema.serviciosExtras)
      .where(eq(dbModule.schema.serviciosExtras.id, id))
      .limit(1);
    if (!service) {
      return NextResponse.json({ error: "Servicio extra no encontrado." }, { status: 404 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Selecciona un voucher." }, { status: 400 });
    }
    const maxBytes = maxLocalUploadBytes(file.type);
    if (maxBytes === null) {
      return NextResponse.json(
        { error: "Solo se admiten vouchers en PDF, JPG, PNG o WebP." },
        { status: 400 },
      );
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `El voucher supera el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.` },
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

    const safeFilename = file.name.replace(/[\r\n"]/g, "_").slice(0, 255) || "voucher";
    const storageKey = `servicios-extras/${id}/vouchers/${randomUUID()}.${extensionForMimeType(file.type)}`;
    const uploaded = await uploadObject(storageKey, bytes, file.type, BUCKET);
    uploadedKey = uploaded.key;
    const [updated] = await dbModule.db
      .update(dbModule.schema.serviciosExtras)
      .set({
        voucherFilename: safeFilename,
        voucherStorageKey: uploaded.key,
        voucherMimeType: file.type,
        updatedAt: new Date(),
      })
      .where(eq(dbModule.schema.serviciosExtras.id, id))
      .returning({
        id: dbModule.schema.serviciosExtras.id,
        voucherFilename: dbModule.schema.serviciosExtras.voucherFilename,
        voucherMimeType: dbModule.schema.serviciosExtras.voucherMimeType,
      });
    if (!updated) throw new Error("No se pudo registrar el voucher.");
    uploadedKey = null;

    if (service.voucherStorageKey) {
      try {
        await deleteObject(service.voucherStorageKey, BUCKET);
      } catch (cleanupError) {
        console.error("[servicios-extras] no se pudo eliminar el voucher reemplazado", cleanupError);
      }
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error("[servicios-extras] no se pudo eliminar el voucher incompleto", cleanupError);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el voucher." },
      { status: 500 },
    );
  }
}
