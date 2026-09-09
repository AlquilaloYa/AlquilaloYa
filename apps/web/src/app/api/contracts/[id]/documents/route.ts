import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { sha256Hex } from "@/lib/hash";
import { uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_TIPOS = [
  "VOUCHER_MENSUALIDAD",
  "VOUCHER_GARANTIA",
  "VOUCHER_MANTENIMIENTO",
  "CONTRATO_NOTARIADO",
] as const;

type Ctx = { params: { id: string } };

/**
 * POST /api/contracts/:id/documents
 * Body: FormData { file: File, tipo: string }
 * Sube un archivo adjunto al contrato (vouchers, contrato notariado).
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tipo = (formData.get("tipo") as string) ?? "";

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (!ALLOWED_TIPOS.includes(tipo as typeof ALLOWED_TIPOS[number])) {
      return NextResponse.json(
        { error: `Tipo no válido: ${tipo}. Permitidos: ${ALLOWED_TIPOS.join(", ")}` },
        { status: 400 }
      );
    }

    const contractId = params.id;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storageKey = `${contractId}/${tipo}/${file.name}`;
    const sha = sha256Hex(bytes);

    let storedKey: string | null = null;
    let uploadError: string | null = null;
    try {
      const stored = await uploadObject(storageKey, bytes, file.type || "application/pdf");
      storedKey = stored.key;
    } catch (e) {
      uploadError = (e as Error).message;
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    // Verificar si ya existe un documento del mismo tipo para este contrato
    const { eq, and } = await import("drizzle-orm");
    const [existing] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.contractId, contractId),
          eq(schema.documents.tipo, tipo)
        )
      )
      .limit(1);

    const values = {
      contractId,
      snapshotId: null as string | null,
      tipo,
      version: existing ? existing.version + 1 : 1,
      storageKey: storedKey,
      filename: file.name,
      mimeType: file.type || "application/pdf",
      sizeBytes: bytes.byteLength,
      sha256: sha,
      estadoGeneracion: uploadError ? "ERROR" : "GENERADO",
      error: uploadError,
      idempotencyKey: `${contractId}:${tipo}:${Date.now()}`,
      updatedAt: new Date(),
    };

    let row;
    if (existing) {
      const rows = await db
        .update(schema.documents)
        .set(values)
        .where(eq(schema.documents.id, existing.id))
        .returning();
      row = rows[0];
    } else {
      const rows = await db
        .insert(schema.documents)
        .values(values)
        .returning();
      row = rows[0];
    }

    if (!row) {
      return NextResponse.json(
        { error: "No se pudo guardar el documento" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: row.id,
        tipo: row.tipo,
        version: row.version,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
        storageKey: row.storageKey,
        estadoGeneracion: row.estadoGeneracion,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
