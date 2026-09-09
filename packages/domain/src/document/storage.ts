import type { UUID } from "../common/index";

/**
 * Conector de almacenamiento privado.
 * El dominio depende de esta abstracción, no de un proveedor concreto (Supabase, S3, R2).
 */
export interface StorageConnector {
  put(input: StoragePutInput): Promise<StoragePutResult>;
  get(storageKey: string): Promise<Uint8Array>;
  del(storageKey: string): Promise<void>;
  getSignedUrl(storageKey: string, options?: { expiresInSeconds?: number }): Promise<string>;
}

export interface StoragePutInput {
  key: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface StoragePutResult {
  key: string;
  sizeBytes: number;
}

export interface DocumentStoragePort {
  /** Registra el documento como generado con su hash y clave de almacenamiento. */
  markCompleted(documentId: UUID, result: {
    storageKey: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<unknown>;
  markFailed(documentId: UUID, error: string): Promise<unknown>;
  findByIdempotencyKey(key: string): Promise<unknown>;
}