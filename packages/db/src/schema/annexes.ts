import {
  boolean,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { departments } from "./departments";
import { contracts } from "./contracts";

/**
 * Anexo por departamento (Fase 3).
 * Resolver anexos activos por departamento y congelar la versión utilizada.
 */
export const annexes = pgTable("annexes", {
  id: uuid("id").primaryKey().defaultRandom(),
  departamentoId: uuid("departamento_id")
    .notNull()
    .references(() => departments.id, { onDelete: "cascade" }),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const annexVersions = pgTable(
  "annex_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    annexId: uuid("annex_id")
      .notNull()
      .references(() => annexes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contenido: text("contenido").notNull(),
    publicada: boolean("publicada").notNull().default(false),
    publicadoEn: timestamp("publicado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("annex_versions_annex_id_version_unique").on(table.annexId, table.version),
    index("annex_versions_annex_idx").on(table.annexId),
  ]
);

/** Vinculación de una versión de anexo concreta a un contrato. */
export const contractAnnexes = pgTable(
  "contract_annexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    annexVersionId: uuid("annex_version_id")
      .notNull()
      .references(() => annexVersions.id),
  },
  (table) => [
    unique("contract_annexes_contrato_annex_unique").on(
      table.contratoId,
      table.annexVersionId
    ),
    index("contract_annexes_contrato_idx").on(table.contratoId),
  ]
);

export type AnnexRow = typeof annexes.$inferSelect;
export type NewAnnexRow = typeof annexes.$inferInsert;
export type AnnexVersionRow = typeof annexVersions.$inferSelect;
export type NewAnnexVersionRow = typeof annexVersions.$inferInsert;
export type ContractAnnexRow = typeof contractAnnexes.$inferSelect;
export type NewContractAnnexRow = typeof contractAnnexes.$inferInsert;