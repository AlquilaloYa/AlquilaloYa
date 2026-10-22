import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FOTOS = 5;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const BUCKET = "blacklist";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** GET /api/personas-no-alquilar — lista negra activa (personas a las que nunca alquilar). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { desc, isNull } = await import("drizzle-orm");

    const rows = await db
      .select({
        id: schema.personasNoAlquilar.id,
        nombres: schema.personasNoAlquilar.nombres,
        documentoIdentidad: schema.personasNoAlquilar.documentoIdentidad,
        telefono: schema.personasNoAlquilar.telefono,
        motivo: schema.personasNoAlquilar.motivo,
        fotos: schema.personasNoAlquilar.fotos,
        creadoPor: schema.personasNoAlquilar.creadoPor,
        createdAt: schema.personasNoAlquilar.createdAt,
      })
      .from(schema.personasNoAlquilar)
      .where(isNull(schema.personasNoAlquilar.eliminadoEn))
      .orderBy(desc(schema.personasNoAlquilar.createdAt));

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        nombres: row.nombres,
        documentoIdentidad: row.documentoIdentidad,
        telefono: row.telefono,
        motivo: row.motivo,
        tieneFoto: row.fotos.length > 0,
        totalFotos: row.fotos.length,
        creadoPor: row.creadoPor,
        createdAt: row.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/personas-no-alquilar — registra una persona (multipart: nombres, documentoIdentidad, telefono, fotos). */
export async function POST(req: Request) {
  let uploadedKeys: string[] = [];
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: "El almacenamiento privado no está configurado" },
        { status: 503 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "No se pudo leer la carga de fotos" },
        { status: 400 }
      );
    }
    const nombres = String(form.get("nombres") ?? "").trim();
    const documentoIdentidad = String(form.get("documentoIdentidad") ?? "").trim();
    const telefono = String(form.get("telefono") ?? "").trim() || null;
    const motivo = String(form.get("motivo") ?? "").trim() || null;
    // "fotos" admite varias; "foto" sigue funcionando por compatibilidad.
    const archivos = [...form.getAll("fotos"), ...form.getAll("foto")].filter(
      (entry): entry is File => entry instanceof File
    );

    if (!nombres) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    if (!documentoIdentidad) {
      return NextResponse.json({ error: "El documento (DNI) es obligatorio" }, { status: 400 });
    }
    if (archivos.length > MAX_FOTOS) {
      return NextResponse.json(
        { error: `Puedes adjuntar hasta ${MAX_FOTOS} fotos` },
        { status: 400 }
      );
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const id = randomUUID();
    const fotos: Array<{ key: string; mimeType: string; sizeBytes: number }> = [];
    let totalBytes = 0;
    for (const file of archivos) {
      if (!IMAGE_TYPES.has(file.type)) {
        throw new Error("Solo se permiten fotos JPEG, PNG o WebP");
      }
      if (file.size <= 0 || file.size > MAX_BYTES) {
        throw new Error("Cada foto debe pesar entre 1 byte y 8 MB");
      }
      totalBytes += file.size;
      if (totalBytes > MAX_REQUEST_BYTES) {
        throw new Error("Las fotos superan el límite de 40 MB por registro");
      }
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const key = `blacklist/${id}/${randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const stored = await uploadObject(key, bytes, file.type, BUCKET);
      uploadedKeys.push(stored.key);
      fotos.push({ key: stored.key, mimeType: file.type, sizeBytes: bytes.byteLength });
    }

    try {
      await db.insert(schema.personasNoAlquilar).values({
        id,
        nombres,
        documentoIdentidad,
        telefono,
        motivo,
        fotos,
        creadoPor: auth.user.name || auth.user.email,
      });
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) => deleteObject(key, BUCKET).catch(() => undefined))
      );
      uploadedKeys = [];
      const message = (error as Error).message;
      const esUnico = /personas_no_alquilar_documento|duplicate key/i.test(message);
      return NextResponse.json(
        {
          error: esUnico
            ? "Ya existe una persona registrada con ese documento"
            : message,
        },
        { status: esUnico ? 409 : 500 }
      );
    }
    uploadedKeys = [];

    return NextResponse.json(
      {
        id,
        nombres,
        documentoIdentidad,
        telefono,
        motivo,
        tieneFoto: fotos.length > 0,
        totalFotos: fotos.length,
      },
      { status: 201 }
    );
  } catch (error) {
    await Promise.all(
      uploadedKeys.map((key) => deleteObject(key, BUCKET).catch(() => undefined))
    );
    const message = (error as Error).message;
    const status =
      message.startsWith("Solo se permiten") ||
      message.startsWith("Cada foto") ||
      message.startsWith("Las fotos superan") ||
      message.startsWith("Puedes adjuntar")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
