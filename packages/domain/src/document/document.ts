import type { UUID } from "../common/index";

/** Estados de generación del documento persistido. */
export const DocumentGeneracionEstado = {
  REQUESTED: "REQUESTED",
  GENERATING: "GENERATING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type DocumentGeneracionEstado =
  (typeof DocumentGeneracionEstado)[keyof typeof DocumentGeneracionEstado];

/** Tipos de documento que el engine puede generar. */
export const DocumentTipo = {
  CONTRATO_PDF: "CONTRATO_PDF",
} as const;

export type DocumentTipo = (typeof DocumentTipo)[keyof typeof DocumentTipo];

/**
 * Documento generado a partir del snapshot.
 * - `storageKey`: clave del objeto en el storage privado.
 * - `sha256`: hash de los bytes exactos almacenados (integridad, no firma).
 * - `version`: permite conservar histórico sin sobrescribir (documento histórico no se sobrescribe).
 */
export interface Document {
  id: UUID;
  contractId: UUID;
  snapshotId: UUID;
  tipo: DocumentTipo;
  version: number;
  storageKey: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  sha256: string | null;
  estadoGeneracion: DocumentGeneracionEstado;
  idempotencyKey: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input para solicitar la generación de un documento a partir de un snapshot. */
export interface RequestDocumentInput {
  contractId: UUID;
  snapshotId: UUID;
  tipo?: DocumentTipo;
  filename?: string;
}

/** Resultado de la generación: bytes + metadata calculada por el engine. */
export interface GeneratedDocument {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  sha256: string;
}