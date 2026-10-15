import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const MAX_BYTES = 8 * 1024 * 1024;
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
        tieneFoto: schema.personasNoAlquilar.fotoStorageKey,
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
        tieneFoto: Boolean(row.tieneFoto),
        creadoPor: row.creadoPor,
        createdAt: row.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/personas-no-alquilar — registra una persona (multipart: nombres, documentoIdentidad, telefono, foto). */
export async function POST(req: Request) {
  let uploadedKey: string | null = null;
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

    const form = await req.formData();
    const nombres = String(form.get("nombres") ?? "").trim();
    const documentoIdentidad = String(form.get("documentoIdentidad") ?? "").trim();
    const telefono = String(form.get("telefono") ?? "").trim() || null;
    const file = form.get("foto");

    if (!nombres) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    if (!documentoIdentidad) {
      return NextResponse.json({ error: "El documento (DNI) es obligatorio" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const id = randomUUID();
    let fotoStorageKey: string | null = null;
    let fotoMimeType: string | null = null;

    if (file) {
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "La foto de DNI es inválida" }, { status: 400 });
      }
      if (!IMAGE_TYPES.has(file.type)) {
        return NextResponse.json({ error: "La foto debe ser JPEG, PNG o WebP" }, { status: 400 });
      }
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return NextResponse.json({ error: "La foto debe pesar entre 1 byte y 8 MB" }, { status: 400 });
      }
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const key = `blacklist/${id}/dni-${id}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const stored = await uploadObject(key, bytes, file.type);
      uploadedKey = stored.key;
      fotoStorageKey = stored.key;
      fotoMimeType = file.type;
    }

    try {
      await db.insert(schema.personasNoAlquilar).values({
        id,
        nombres,
        documentoIdentidad,
        telefono,
        fotoStorageKey,
        fotoMimeType,
        creadoPor: auth.user.name || auth.user.email,
      });
    } catch (error) {
      if (uploadedKey) await deleteObject(uploadedKey).catch(() => undefined);
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
    uploadedKey = null;

    return NextResponse.json({ id, nombres, documentoIdentidad, telefono, tieneFoto: Boolean(fotoStorageKey) }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteObject(uploadedKey).catch(() => undefined);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
