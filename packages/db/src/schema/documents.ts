import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contracts } from "./contracts";
import { contractSnapshots } from "./snapshots";

/**
 * Documentos generados (Fase 4).
 * - `sha256`: integridad del contenido almacenado (no es una firma electrónica).
 * - `idempotencyKey`: evita duplicados de generación (contract:{contractId}:document:{snapshotId}).
 * - `storageKey`: clave del objeto en el storage privado.
 * - `version`: el documento histórico no se sobrescribe.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .references(() => contractSnapshots.id),
    tipo: varchar("tipo", { length: 50 }).notNull().default("CONTRATO_PDF"),
    version: integer("version").notNull().default(1),
    storageKey: text("storage_key"),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes"),
    sha256: varchar("sha256", { length: 64 }),
    estadoGeneracion: varchar("estado_generacion", { length: 30 })
      .notNull()
      .default("REQUESTED"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("documents_contract_idx").on(table.contractId),
    index("documents_snapshot_idx").on(table.snapshotId),
    unique("documents_idempotency_key_unique").on(table.idempotencyKey),
  ]
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;