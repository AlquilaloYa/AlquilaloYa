import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { ActivityAction } from "@contract/domain/activity";
import { requireUser, requirePermission } from "@/lib/session";
import { registrarActividadHR } from "@/lib/rrhh-actividad";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
const HR_BUCKET = "hr-documents";
const MAX_BYTES = 25 * 1024 * 1024;
const CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_READ);
    if (denied) return denied;
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const rows = await db.select({
      id: schema.hrEmployeeDocuments.id,
      employeeId: schema.hrEmployeeDocuments.employeeId,
      employmentId: schema.hrEmployeeDocuments.employmentId,
      tipo: schema.hrEmployeeDocuments.tipo,
      nombre: schema.hrEmployeeDocuments.nombre,
      version: schema.hrEmployeeDocuments.version,
      mimeType: schema.hrEmployeeDocuments.mimeType,
      sizeBytes: schema.hrEmployeeDocuments.sizeBytes,
      sha256: schema.hrEmployeeDocuments.sha256,
      estado: schema.hrEmployeeDocuments.estado,
      fechaDocumento: schema.hrEmployeeDocuments.fechaDocumento,
      venceEn: schema.hrEmployeeDocuments.venceEn,
      uploadedBy: schema.hrEmployeeDocuments.uploadedBy,
      createdAt: schema.hrEmployeeDocuments.createdAt,
    }).from(schema.hrEmployeeDocuments).where(eq(schema.hrEmployeeDocuments.employeeId, params.id))
      .orderBy(desc(schema.hrEmployeeDocuments.createdAt));
    return NextResponse.json(rows.map((row) => ({ ...row, fechaDocumento: row.fechaDocumento?.toISOString() ?? null, venceEn: row.venceEn?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let uploadedKey: string | null = null;
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_UPDATE);
    if (denied) return denied;
    if (!isStorageConfigured()) return NextResponse.json({ error: "El almacenamiento privado no está configurado" }, { status: 503 });

    const form = await req.formData();
    const file = form.get("file");
    const tipo = String(form.get("tipo") ?? "PERSONAL").trim().toUpperCase();
    const fechaDocumento = String(form.get("fechaDocumento") ?? "").trim();
    const venceEn = String(form.get("venceEn") ?? "").trim();
    const employmentId = String(form.get("employmentId") ?? "").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
    if (!CONTENT_TYPES.has(file.type)) return NextResponse.json({ error: "Solo se admiten PDF, JPEG o PNG" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 25 MB" }, { status: 400 });
    if (!tipo || !/^[A-Z0-9_-]{2,60}$/.test(tipo)) return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });

    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const [employee] = await db.select({ id: schema.hrEmployees.id, deletedAt: schema.hrEmployees.deletedAt })
      .from(schema.hrEmployees).where(eq(schema.hrEmployees.id, params.id)).limit(1);
    if (!employee || employee.deletedAt) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    if (employmentId) {
      const [employment] = await db.select({ id: schema.hrEmployments.id }).from(schema.hrEmployments)
        .where(and(eq(schema.hrEmployments.id, employmentId), eq(schema.hrEmployments.employeeId, params.id))).limit(1);
      if (!employment) return NextResponse.json({ error: "La relación laboral no pertenece a este empleado" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const [latest] = await db.select({ version: sql<number>`coalesce(max(${schema.hrEmployeeDocuments.version}), 0)` })
      .from(schema.hrEmployeeDocuments).where(and(eq(schema.hrEmployeeDocuments.employeeId, params.id), eq(schema.hrEmployeeDocuments.tipo, tipo)));
    const version = Number(latest?.version ?? 0) + 1;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "documento";
    const storageKey = `${params.id}/${tipo}/${version}-${randomUUID()}-${safeName}`;
    const stored = await uploadObject(storageKey, bytes, file.type, HR_BUCKET);
    uploadedKey = stored.key;

    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.hrEmployeeDocuments).values({
        employeeId: params.id,
        employmentId: employmentId || null,
        tipo,
        nombre: file.name.slice(0, 255),
        version,
        storageKey,
        mimeType: file.type,
        sizeBytes: stored.sizeBytes,
        sha256,
        fechaDocumento: fechaDocumento ? new Date(fechaDocumento) : null,
        venceEn: venceEn ? new Date(venceEn) : null,
        uploadedBy: auth.user.name || auth.user.email,
      }).returning();
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: params.id,
        actor: auth.user.name || auth.user.email,
        action: "DOCUMENT_UPLOADED",
        motivo: `Subida de ${tipo} · versión ${version}`,
        after: { documentId: row?.id, tipo, nombre: file.name, version, sha256, venceEn: venceEn || null },
      });
      return row;
    });
    if (!inserted) throw new Error("No se pudo registrar el documento");
    uploadedKey = null;
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: auth.user.name || auth.user.email,
      action: ActivityAction.HR_DOCUMENT_UPLOADED,
      entityId: params.id,
      metadata: { tipo, nombre: inserted.nombre, version: inserted.version },
    });
    return NextResponse.json({ id: inserted.id, tipo, nombre: inserted.nombre, version, sha256, venceEn: inserted.venceEn?.toISOString() ?? null }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteObject(uploadedKey, HR_BUCKET).catch(() => undefined);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

