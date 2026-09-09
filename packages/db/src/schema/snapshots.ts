import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { templateVersions } from "./templates";

/**
 * Snapshot contractual (Fase 3).
 * Conserva los datos usados al emitir:
 * datosCliente, datosDepartamento, datosContrato, plantillaVersionId, clausulas, anexos.
 * Al emitir, el snapshot se vuelve inmutable.
 */
export const contractSnapshots = pgTable(
  "contract_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigoContrato: varchar("codigo_contrato", { length: 50 }).notNull(),
    plantillaVersionId: uuid("plantilla_version_id")
      .notNull()
      .references(() => templateVersions.id),
    datosCliente: jsonb("datos_cliente").notNull(),
    datosDepartamento: jsonb("datos_departamento").notNull(),
    datosContrato: jsonb("datos_contrato").notNull(),
    clausulas: jsonb("clausulas").notNull().default([]),
    anexos: jsonb("anexos").notNull().default([]),
    inmutable: boolean("inmutable").notNull().default(false),
    emitidoEn: timestamp("emitido_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contract_snapshots_codigo_idx").on(table.codigoContrato)]
);

export type ContractSnapshotRow = typeof contractSnapshots.$inferSelect;
export type NewContractSnapshotRow = typeof contractSnapshots.$inferInsert;