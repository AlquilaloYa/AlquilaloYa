import type { ContractSnapshot } from "@contract/domain/snapshot";
import type { DocumentRow } from "@contract/db";
import { sha256Hex } from "./hash";
import {
  downloadObject,
  isStorageConfigured,
  uploadObject,
} from "./storage";

type DbModule = typeof import("@contract/db");

export class DocumentIntegrityError extends Error {
  readonly expected: string;
  readonly actual: string;
  constructor(expected: string, actual: string) {
    super(
      `Integridad comprometida: sha256 esperado ${expected.slice(0, 12)}…, obtenido ${actual.slice(0, 12)}…`
    );
    this.name = "DocumentIntegrityError";
    this.expected = expected;
    this.actual = actual;
  }
}

/** Clave de storage: "{contractId}/{tipo}/{filename}". */
export function buildDocumentStorageKey(
  contractId: string,
  tipo: string,
  filename: string
): string {
  return `${contractId}/${tipo}/${filename}`;
}

export interface RegisterDocumentInput {
  contractId: string;
  snapshotId: string;
  tipo: string;
  version: number;
  filename: string;
  bytes: Uint8Array;
  idempotencyKey: string;
  /** Re-subida forzada (repara un objeto corrupto aunque la fila esté GENERADO). */
  force?: boolean;
}

/**
 * Registra un documento generado: sube el PDF al bucket privado y persiste la
 * fila con storageKey + sizeBytes + sha256 (integridad). Idempotente: si ya
 * existe una fila GENERADO con la misma idempotencyKey, no vuelve a subir nada.
 */
export async function registerGeneratedDocument(
  db: DbModule["db"],
  schema: DbModule["schema"],
  input: RegisterDocumentInput
): Promise<DocumentRow> {
  const { eq } = await import("drizzle-orm");

  const [existing] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (
    existing &&
    !input.force &&
    existing.estadoGeneracion === "GENERADO" &&
    existing.storageKey
  ) {
    return existing;
  }

  const sha = sha256Hex(input.bytes);
  const storageKey = buildDocumentStorageKey(
    input.contractId,
    input.tipo,
    input.filename
  );

  let storedKey: string | null = null;
  let sizeBytes: number | null = null;
  let uploadError: string | null = null;

  if (isStorageConfigured()) {
    try {
      const stored = await uploadObject(storageKey, input.bytes);
      storedKey = stored.key;
      sizeBytes = stored.sizeBytes;
    } catch (error) {
      uploadError = (error as Error).message;
    }
  }

  const values = {
    contractId: input.contractId,
    snapshotId: input.snapshotId,
    tipo: input.tipo,
    version: input.version,
    storageKey: storedKey,
    filename: input.filename,
    mimeType: "application/pdf",
    sizeBytes: sizeBytes ?? input.bytes.byteLength,
    sha256: sha,
    estadoGeneracion: uploadError ? "ERROR" : "GENERADO",
    error: uploadError,
    idempotencyKey: input.idempotencyKey,
    updatedAt: new Date(),
  };

  if (existing) {
    const rows = await db
      .update(schema.documents)
      .set(values)
      .where(eq(schema.documents.id, existing.id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("No se pudo actualizar el documento");
    return row;
  }

  const inserted = await db.insert(schema.documents).values(values).returning();
  const row = inserted[0];
  if (!row) throw new Error("No se pudo registrar el documento");
  return row;
}

/** Busca la fila de documento por id. */
export async function findDocumentById(
  db: DbModule["db"],
  schema: DbModule["schema"],
  id: string
): Promise<DocumentRow | null> {
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);
  return row ?? null;
}

/** Busca el documento de un snapshot (p. ej. la adenda). */
export async function findDocumentBySnapshot(
  db: DbModule["db"],
  schema: DbModule["schema"],
  snapshotId: string
): Promise<DocumentRow | null> {
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.snapshotId, snapshotId));
  return (
    rows.find((r) => r.estadoGeneracion === "GENERADO") ?? rows[0] ?? null
  );
}

/** Busca el PDF del contrato (tipo CONTRATO_PDF), el más reciente primero. */
export async function findContractPdfDocument(
  db: DbModule["db"],
  schema: DbModule["schema"],
  contractId: string
): Promise<DocumentRow | null> {
  const { eq, desc } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.contractId, contractId))
    .orderBy(desc(schema.documents.createdAt));
  return (
    rows.find(
      (r) => r.tipo === "CONTRATO_PDF" && r.estadoGeneracion === "GENERADO"
    ) ?? null
  );
}

/**
 * Descarga el PDF almacenado y verifica su integridad contra el sha256
 * persistido. Lanza DocumentIntegrityError si los bytes no coinciden.
 */
export async function getStoredDocumentBytes(row: DocumentRow): Promise<Uint8Array> {
  if (!row.storageKey) {
    throw new DocumentIntegrityError(row.sha256 ?? "sin-hash", "sin-storage");
  }
  const bytes = await downloadObject(row.storageKey);
  const actual = sha256Hex(bytes);
  if (row.sha256 && actual !== row.sha256) {
    throw new DocumentIntegrityError(row.sha256, actual);
  }
  return bytes;
}

/** Verificación de integridad sin lanzar (para el endpoint /verify). */
export async function verifyDocumentIntegrity(
  row: DocumentRow
): Promise<{
  ok: boolean;
  expected: string | null;
  actual: string | null;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  if (!row.storageKey) {
    return { ok: false, expected: row.sha256, actual: null, checkedAt };
  }
  try {
    const bytes = await downloadObject(row.storageKey);
    const actual = sha256Hex(bytes);
    return {
      ok: !row.sha256 || actual === row.sha256,
      expected: row.sha256,
      actual,
      checkedAt,
    };
  } catch {
    return { ok: false, expected: row.sha256, actual: null, checkedAt };
  }
}

/**
 * Garantiza que el contrato emitido tenga su PDF registrado en storage.
 * - Si ya existe un CONTRATO_PDF con storageKey → no-op.
 * - Si hay snapshot inmutable → genera el PDF, lo sube y registra (idempotente).
 * Devuelve la fila del documento, o null si el contrato no tiene snapshot.
 */
export async function ensureContractPdfDocument(
  db: DbModule["db"],
  schema: DbModule["schema"],
  contractRepository: {
    findWithRelations(
      id: string
    ): Promise<{ id: string; codigoContrato: string; snapshot?: ContractSnapshot | null } | null>;
  },
  contractId: string
): Promise<DocumentRow | null> {
  const existing = await findContractPdfDocument(db, schema, contractId);
  if (existing?.storageKey) return existing;

  const contract = await contractRepository.findWithRelations(contractId);
  if (!contract) return null;
  const snapshot = contract.snapshot;
  if (!snapshot || !snapshot.inmutable) return null;

  // Buscar el HTML de la plantilla para usarlo como base del PDF
  let templateHtml: string | null = null;
  if (snapshot.plantillaVersionId) {
    try {
      const { eq } = await import("drizzle-orm");
      const [tv] = await db
        .select({ contenido: schema.templateVersions.contenido })
        .from(schema.templateVersions)
        .where(eq(schema.templateVersions.id, snapshot.plantillaVersionId))
        .limit(1);
      templateHtml = tv?.contenido ?? null;
    } catch {
      // Si falla, usar formato genérico
    }
  }

  const { generateContractPdf } = await import("./pdf/generate-pdf");
  const pdf = await generateContractPdf(snapshot, templateHtml);
  return registerGeneratedDocument(db, schema, {
    contractId: contract.id,
    snapshotId: snapshot.id,
    tipo: "CONTRATO_PDF",
    version: existing?.version ?? 1,
    filename: `${contract.codigoContrato}.pdf`,
    bytes: pdf.bytes,
    idempotencyKey: `contract:${contract.id}:document:${snapshot.id}`,
  });
}
