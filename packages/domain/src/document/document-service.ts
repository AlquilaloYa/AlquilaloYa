import type { UUID } from "../common/index";
import type { ContractSnapshot } from "../snapshot/index";
import type {
  Document,
  RequestDocumentInput,
  GeneratedDocument,
} from "./document";
import { DocumentGeneracionEstado as Estado, DocumentTipo } from "./document";
import type { DocumentGenerator } from "./document-generator";
import type {
  StorageConnector,
  DocumentStoragePort,
} from "./storage";
import type { DocumentDomainEvent } from "./domain-events";
import { DocumentDomainEventName as EventName } from "./domain-events";

/** Persistencia mínima del dominio de documentos. */
export interface DocumentRepository {
  create(input: {
    contractId: UUID;
    snapshotId: UUID;
    tipo: Document["tipo"];
    version: number;
    filename: string;
    mimeType: string;
    idempotencyKey: string;
  }): Promise<Document>;
  findById(id: UUID): Promise<Document | null>;
  findBySnapshot(snapshotId: UUID): Promise<Document | null>;
  findByContract(contractId: UUID): Promise<Document[]>;
}

export interface SnapshotReader {
  findById(id: UUID): Promise<ContractSnapshot | null>;
}

/** Emite un evento de dominio de documento. */
export type DocumentEventSink = (
  event: DocumentDomainEvent
) => void | Promise<void>;

function nowIso(): string {
  return new Date().toISOString();
}

function idempotencyKeyFor(contractId: UUID, snapshotId: UUID): string {
  return `contract:${contractId}:document:${snapshotId}`;
}

function buildFilename(snapshot: ContractSnapshot, extension: string): string {
  const base = snapshot.codigoContrato || "contrato";
  return `${base}.${extension}`;
}

/**
 * DocumentService: orquesta la generación de documento desde el snapshot.
 * - Solo consume datos congelados (snapshot) -> garantiza reproducción histórica.
 * - Idempotente: la clave contract:{contractId}:document:{snapshotId} evita duplicados.
 * - El hash (SHA-256) se calcula sobre los bytes exactos almacenados.
 */
export class DocumentService {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly snapshots: SnapshotReader,
    private readonly generator: DocumentGenerator,
    private readonly storage: StorageConnector,
    private readonly documentStore: DocumentStoragePort,
    private readonly sink: DocumentEventSink = () => {}
  ) {}

  private async emit(event: DocumentDomainEvent): Promise<void> {
    await this.sink(event);
  }

  /** Verifica que el snapshot exista y devuelva su inmutable garantizado por el dominio. */
  private async requireSnapshot(snapshotId: UUID): Promise<ContractSnapshot> {
    const snapshot = await this.snapshots.findById(snapshotId);
    if (!snapshot) {
      throw new Error("Snapshot no encontrado");
    }
    if (!snapshot.inmutable) {
      throw new Error("El snapshot debe estar emitido (inmutable) para generar documento");
    }
    return snapshot;
  }

  /**
   * Solicita la generación de un documento (idempotente).
   * Crea el registro en estado REQUESTED con la clave de idempotencia.
   */
  async requestGeneration(input: RequestDocumentInput): Promise<Document> {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    const key = idempotencyKeyFor(input.contractId, input.snapshotId);

    const existing = await this.documentStore.findByIdempotencyKey(key);
    if (existing) {
      // Idempotente: devuelve el documento ya solicitado (no crea duplicado).
      const doc = Array.isArray(existing) ? existing[0] : existing;
      return doc as unknown as Document;
    }

    const created = await this.repo.create({
      contractId: input.contractId,
      snapshotId: input.snapshotId,
      tipo: input.tipo ?? DocumentTipo.CONTRATO_PDF,
      version: 1,
      filename: input.filename ?? buildFilename(snapshot, "pdf"),
      mimeType: "application/pdf",
      idempotencyKey: key,
    });

    await this.emit({
      type: EventName.DOCUMENT_GENERATION_REQUESTED,
      documentId: created.id,
      contractId: input.contractId,
      snapshotId: input.snapshotId,
      payload: { idempotencyKey: key },
      ocurridoEn: nowIso(),
    });

    return created;
  }

  /**
   * Genera el documento: render + storage + hash.
   * Se ejecuta asincrónicamente desde el worker y es idempotente por documento.
   */
  async generate(documentId: UUID): Promise<GeneratedDocument> {
    const doc = await this.repo.findById(documentId);
    if (!doc) {
      throw new Error("Documento no encontrado");
    }
    if (doc.estadoGeneracion === Estado.COMPLETED) {
      // Idempotente: no regenera ni sobrescribe un documento ya completado.
      throw new Error("El documento ya fue generado");
    }

    const snapshot = await this.requireSnapshot(doc.snapshotId);
    const generated = await this.generator.generate({ snapshot });

    const storageContext = await this.storage.put({
      key: buildStorageKey(doc, generated.sha256),
      bytes: generated.bytes,
      mimeType: generated.mimeType,
    });

    await this.documentStore.markCompleted(doc.id, {
      storageKey: storageContext.key,
      sha256: generated.sha256,
      sizeBytes: storageContext.sizeBytes,
    });

    await this.emit({
      type: EventName.DOCUMENT_GENERATED,
      documentId: doc.id,
      contractId: doc.contractId,
      snapshotId: doc.snapshotId,
      payload: {
        sha256: generated.sha256,
        storageKey: storageContext.key,
        filename: doc.filename,
      },
      ocurridoEn: nowIso(),
    });

    return generated;
  }

  /** Marca el documento como fallido y emite el evento correspondiente. */
  async failGeneration(documentId: UUID, error: string): Promise<Document> {
    const doc = await this.repo.findById(documentId);
    if (!doc) {
      throw new Error("Documento no encontrado");
    }
    await this.documentStore.markFailed(doc.id, error);
    await this.emit({
      type: EventName.DOCUMENT_GENERATION_FAILED,
      documentId: doc.id,
      contractId: doc.contractId,
      snapshotId: doc.snapshotId,
      payload: { error },
      ocurridoEn: nowIso(),
    });
    return (await this.repo.findById(documentId)) as Document;
  }

  /** Reclama una URL firmada temporal para descarga autorizada. */
  async getDownloadUrl(documentId: UUID): Promise<string> {
    const doc = await this.repo.findById(documentId);
    if (!doc) {
      throw new Error("Documento no encontrado");
    }
    if (doc.estadoGeneracion !== Estado.COMPLETED || !doc.storageKey) {
      throw new Error("El documento aún no está generado");
    }
    const url = await this.storage.getSignedUrl(doc.storageKey, {
      expiresInSeconds: 900,
    });
    await this.emit({
      type: EventName.DOCUMENT_DOWNLOADED,
      documentId: doc.id,
      contractId: doc.contractId,
      snapshotId: doc.snapshotId,
      payload: { storageKey: doc.storageKey },
      ocurridoEn: nowIso(),
    });
    return url;
  }
}

function buildStorageKey(
  doc: Pick<Document, "contractId" | "snapshotId" | "tipo" | "version">,
  sha256: string
): string {
  return `contracts/${doc.contractId}/documents/${doc.snapshotId}/v${doc.version}/${sha256}.pdf`;
}