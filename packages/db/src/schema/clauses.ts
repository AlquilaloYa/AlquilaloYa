import {
  integer,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contracts } from "./contracts";

/**
 * Cláusula negociable (Fase 3).
 * Conservar la versión exacta utilizada al vincularse a un contrato.
 */
export const clauses = pgTable("clauses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: varchar("clave", { length: 50 }).notNull().unique(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clauseVersions = pgTable(
  "clause_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clauseId: uuid("clause_id")
      .notNull()
      .references(() => clauses.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contenido: text("contenido").notNull(),
    publicada: varchar("publicada", { length: 30 }).notNull().default("BORRADOR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("clause_versions_clause_id_version_unique").on(table.clauseId, table.version),
    index("clause_versions_clause_idx").on(table.clauseId),
  ]
);

/** Vinculación de una versión de cláusula concreta a un contrato. */
export const contractClauses = pgTable(
  "contract_clauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    clauseVersionId: uuid("clause_version_id")
      .notNull()
      .references(() => clauseVersions.id),
    orden: integer("orden").notNull().default(0),
  },
  (table) => [
    unique("contract_clauses_contrato_clause_unique").on(
      table.contratoId,
      table.clauseVersionId
    ),
    index("contract_clauses_contrato_idx").on(table.contratoId),
  ]
);

export type ClauseRow = typeof clauses.$inferSelect;
export type NewClauseRow = typeof clauses.$inferInsert;
export type ClauseVersionRow = typeof clauseVersions.$inferSelect;
export type NewClauseVersionRow = typeof clauseVersions.$inferInsert;
export type ContractClauseRow = typeof contractClauses.$inferSelect;
export type NewContractClauseRow = typeof contractClauses.$inferInsert;