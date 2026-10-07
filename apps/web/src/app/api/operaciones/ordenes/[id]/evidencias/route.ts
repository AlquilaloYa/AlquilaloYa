import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import {
  createSignedObjectUrl,
  deleteObject,
  uploadObject,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const BUCKET = "work-order-evidence";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function matchesImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    type === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_UPDATE,
    );
    if (denied) return denied;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de orden no válido" },
        { status: 400 },
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Las fotos superan el límite de 24 MB por carga" },
        { status: 413 },
      );
    }

    const { db, schema } = dbModule;
    const [order] = await db
      .select({
        id: schema.workOrders.id,
        assignedEmployeeId: schema.workOrders.assignedEmployeeId,
        status: schema.workOrders.status,
      })
      .from(schema.workOrders)
      .where(eq(schema.workOrders.id, params.id))
      .limit(1);
    if (!order)
      return NextResponse.json(
        { error: "Orden de trabajo no encontrada" },
        { status: 404 },
      );
    if (auth.user.role === "OPERADOR") {
      const [employee] = await db
        .select({ id: schema.hrEmployees.id })
        .from(schema.hrEmployees)
        .where(
          and(
            eq(schema.hrEmployees.userId, auth.user.id),
            eq(schema.hrEmployees.estado, "ACTIVO"),
            isNull(schema.hrEmployees.deletedAt),
          ),
        )
        .limit(1);
      if (!employee || order.assignedEmployeeId !== employee.id) {
        return NextResponse.json(
          { error: "Orden de trabajo no encontrada" },
          { status: 404 },
        );
      }
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "No se pudo leer la carga de fotos" },
        { status: 400 },
      );
    }
    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length < 1 || files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Adjunta entre 1 y ${MAX_FILES} fotos por carga` },
        { status: 400 },
      );
    }

    const uploadedKeys: string[] = [];
    const rows: Array<{
      workOrderId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: string;
      uploadedBy: string;
    }> = [];
    let savedAttachments: (typeof schema.workOrderAttachments.$inferSelect)[] =
      [];
    try {
      let totalBytes = 0;
      for (const file of files) {
        if (file.size < 1 || file.size > MAX_FILE_BYTES) {
          throw new Error("Cada foto debe pesar entre 1 byte y 8 MB");
        }
        totalBytes += file.size;
        if (totalBytes > MAX_REQUEST_BYTES) {
          throw new Error("Las fotos superan el límite de 24 MB por carga");
        }
        const mimeType = file.type.toLowerCase();
        if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
          throw new Error("Solo se permiten fotos JPG, PNG o WebP");
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesImageSignature(mimeType, bytes)) {
          throw new Error(
            `El archivo "${file.name}" no coincide con un formato de imagen válido`,
          );
        }
        const extension =
          mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
        const key = `${params.id}/${crypto.randomUUID()}.${extension}`;
        await uploadObject(key, bytes, mimeType, BUCKET);
        uploadedKeys.push(key);
        rows.push({
          workOrderId: params.id,
          storageKey: key,
          fileName:
            file.name
              .replace(/[\u0000-\u001f\u007f]/g, "")
              .trim()
              .slice(0, 255) || `evidencia.${extension}`,
          mimeType,
          sizeBytes: String(bytes.byteLength),
          uploadedBy: auth.user.id,
        });
      }

      const now = new Date();
      savedAttachments = await db.transaction(async (tx) => {
        const saved = await tx
          .insert(schema.workOrderAttachments)
          .values(rows)
          .returning();
        await tx.insert(schema.workOrderEvents).values({
          workOrderId: params.id,
          actorId: auth.user.id,
          actorName: auth.user.name,
          eventType: "EVIDENCE_ATTACHED",
          fromStatus: order.status,
          toStatus: order.status,
          details: { count: saved.length },
          createdAt: now,
        });
        return saved;
      });
    } catch (error) {
      await Promise.all(uploadedKeys.map((key) => deleteObject(key, BUCKET)));
      throw error;
    }
    return NextResponse.json(
      await Promise.all(
        savedAttachments.map(async (attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: Number(attachment.sizeBytes),
          createdAt: attachment.createdAt,
          url: await createSignedObjectUrl(attachment.storageKey, BUCKET),
        })),
      ),
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron adjuntar las fotos";
    const status =
      message.includes("entre 1 byte") ||
      message.includes("superan el límite") ||
      message.startsWith("Solo se permiten") ||
      message.includes("no coincide")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
