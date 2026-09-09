import type { UUID } from "../common/index";

export const DocumentDomainEventName = {
  DOCUMENT_GENERATION_REQUESTED: "DOCUMENT_GENERATION_REQUESTED",
  DOCUMENT_GENERATED: "DOCUMENT_GENERATED",
  DOCUMENT_GENERATION_FAILED: "DOCUMENT_GENERATION_FAILED",
  DOCUMENT_DOWNLOADED: "DOCUMENT_DOWNLOADED",
} as const;

export type DocumentDomainEventName =
  (typeof DocumentDomainEventName)[keyof typeof DocumentDomainEventName];

export interface DocumentDomainEvent<TPayload = Record<string, unknown>> {
  type: DocumentDomainEventName;
  documentId: UUID;
  contractId: UUID;
  snapshotId: UUID;
  payload?: TPayload;
  ocurridoEn: string;
}

export type DocumentGeneratedEvent = DocumentDomainEvent<{
  documentId: UUID;
  sha256: string;
  storageKey: string;
  filename: string;
}>;