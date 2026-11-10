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

function fechaPagoLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** GET /api/dias-extras/:id/voucher — sirve el voucher subido (bucket privado). */
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

    const [cargo] = await dbModule.db
      .select({
        voucherStorageKey: dbModule.schema.diasExtras.voucherStorageKey,
        voucherFilename: dbModule.schema.diasExtras.voucherFilename,
        voucherMimeType: dbModule.schema.diasExtras.voucherMimeType,
      })
      .from(dbModule.schema.diasExtras)
      .where(eq(dbModule.schema.diasExtras.id, id))
      .limit(1);
    if (!cargo) {
      return NextResponse.json({ error: "Cargo no encontrado." }, { status: 404 });
    }
    if (!cargo.voucherStorageKey || !cargo.voucherMimeType) {
      return NextResponse.json({ error: "Este cargo no tiene voucher." }, { status: 404 });
    }

    const bytes = await downloadObject(cargo.voucherStorageKey, BUCKET);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": cargo.voucherMimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(cargo.voucherFilename ?? "voucher")}`,
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

/** POST /api/dias-extras/:id/voucher — sube el voucher del pago y marca el cargo como PAGADO. */
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

    const [cargo] = await dbModule.db
      .select({
        id: dbModule.schema.diasExtras.id,
        voucherStorageKey: dbModule.schema.diasExtras.voucherStorageKey,
      })
      .from(dbModule.schema.diasExtras)
      .where(eq(dbModule.schema.diasExtras.id, id))
      .limit(1);
    if (!cargo) {
      return NextResponse.json({ error: "Cargo no encontrado." }, { status: 404 });
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
    const storageKey = `dias-extras/${id}/vouchers/${randomUUID()}.${extensionForMimeType(file.type)}`;
    const uploaded = await uploadObject(storageKey, bytes, file.type, BUCKET);
    uploadedKey = uploaded.key;
    const [updated] = await dbModule.db
      .update(dbModule.schema.diasExtras)
      .set({
        voucherFilename: safeFilename,
        voucherStorageKey: uploaded.key,
        voucherMimeType: file.type,
        estado: "PAGADO",
        fechaPago: fechaPagoLima(),
        updatedAt: new Date(),
      })
      .where(eq(dbModule.schema.diasExtras.id, id))
      .returning({
        id: dbModule.schema.diasExtras.id,
        voucherFilename: dbModule.schema.diasExtras.voucherFilename,
        voucherMimeType: dbModule.schema.diasExtras.voucherMimeType,
        estado: dbModule.schema.diasExtras.estado,
        fechaPago: dbModule.schema.diasExtras.fechaPago,
      });
    if (!updated) throw new Error("No se pudo registrar el voucher.");
    uploadedKey = null;

    if (cargo.voucherStorageKey) {
      try {
        await deleteObject(cargo.voucherStorageKey, BUCKET);
      } catch (cleanupError) {
        console.error("[dias-extras] no se pudo eliminar el voucher reemplazado", cleanupError);
      }
    }
    return NextResponse.json({
      ...updated,
      fechaPago: updated.fechaPago ? String(updated.fechaPago).slice(0, 10) : null,
    });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error("[dias-extras] no se pudo eliminar el voucher incompleto", cleanupError);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el voucher." },
      { status: 500 },
    );
  }
}
