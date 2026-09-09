import { eq } from "drizzle-orm";
import { db } from "@contract/db";
import { documents } from "@contract/db/schema";
import type {
  UUID,
  Document,
  DocumentStoragePort,
  DocumentRepository,
} from "@contract/domain";
import { DocumentGeneracionEstado as Estado } from "@contract/domain/document";

function toDomain(row: typeof documents.$inferSelect): Document {
  if (!row.snapshotId) {
    throw new Error(
      "El worker solo gestiona documentos generados desde snapshot"
    );
  }
  return {
    id: row.id,
    contractId: row.contractId,
    snapshotId: row.snapshotId,
    tipo: row.tipo as Document["tipo"],
    version: row.version,
    storageKey: row.storageKey,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    estadoGeneracion: row.estadoGeneracion as Document["estadoGeneracion"],
    idempotencyKey: row.idempotencyKey,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Repositorio Drizzle de documentos + integración con el DocumentService. */
export class DrizzleDocumentRepository
  implements DocumentRepository, DocumentStoragePort
{
  async create(input: {
    contractId: UUID;
    snapshotId: UUID;
    tipo: Document["tipo"];
    version: number;
    filename: string;
    mimeType: string;
    idempotencyKey: string;
  }): Promise<Document> {
    const [row] = await db
      .insert(documents)
      .values({
        contractId: input.contractId,
        snapshotId: input.snapshotId,
        tipo: input.tipo,
        version: input.version,
        filename: input.filename,
        mimeType: input.mimeType,
        idempotencyKey: input.idempotencyKey,
        estadoGeneracion: Estado.REQUESTED,
      })
      .returning();
    if (!row) {
      throw new Error("No se pudo crear el documento");
    }
    return toDomain(row);
  }

  async findById(id: UUID): Promise<Document | null> {
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    return row ? toDomain(row) : null;
  }

  async findBySnapshot(snapshotId: UUID): Promise<Document | null> {
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.snapshotId, snapshotId));
    return row ? toDomain(row) : null;
  }

  async findByContract(contractId: UUID): Promise<Document[]> {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.contractId, contractId));
    return rows.map(toDomain);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<unknown> {
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.idempotencyKey, idempotencyKey));
    return row ? toDomain(row) : null;
  }

  async markCompleted(
    id: UUID,
    result: { storageKey: string; sha256: string; sizeBytes: number }
  ): Promise<Document> {
    const [row] = await db
      .update(documents)
      .set({
        estadoGeneracion: Estado.COMPLETED,
        storageKey: result.storageKey,
        sha256: result.sha256,
        sizeBytes: result.sizeBytes,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    if (!row) {
      throw new Error("Documento no encontrado al completar");
    }
    return toDomain(row);
  }

  async markFailed(id: UUID, error: string): Promise<Document> {
    const [row] = await db
      .update(documents)
      .set({
        estadoGeneracion: Estado.FAILED,
        error,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    if (!row) {
      throw new Error("Documento no encontrado al marcar fallido");
    }
    return toDomain(row);
  }
}