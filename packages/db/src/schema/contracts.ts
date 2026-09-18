import {
  index,
  numeric,
  pgTable,
  boolean,
  date,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { departments } from "./departments";
import { templateVersions } from "./templates";
import { contractSnapshots } from "./snapshots";

/**
 * Contrato contractual (Fase 3).
 * - Dinero: NUMERIC(15,2) vía numeric.
 * - Fechas contractuales: DATE.
 * - Conserva la versión de plantilla y el snapshot congelado.
 */
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigoContrato: varchar("codigo_contrato", { length: 50 }).notNull().unique(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clients.id),
    departamentoId: uuid("departamento_id")
      .notNull()
      .references(() => departments.id),
    plantillaVersionId: uuid("plantilla_version_id")
      .notNull()
      .references(() => templateVersions.id),
    montoCanonMensual: numeric("monto_canon_mensual", { precision: 15, scale: 2 })
      .notNull(),
    depositoGarantia: numeric("deposito_garantia", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    fechaInicio: date("fecha_inicio").notNull(),
    fechaFin: date("fecha_fin").notNull(),
    estado: varchar("estado", { length: 30 }).notNull().default("BORRADOR"),
    snapshotId: uuid("snapshot_id").references(() => contractSnapshots.id),
    renovadoDe: uuid("renovado_de"),
    separacion: boolean("separacion").notNull().default(true),
    separacionDetalle: jsonb("separacion_detalle"),
    copiaDni: jsonb("copia_dni").notNull().default([]),
    muebleriaItems: jsonb("muebleria_items").notNull().default([]),
    mascotasItems: jsonb("mascotas_items").notNull().default([]),
    datosArrendatario: jsonb("datos_arrendatario"),
    motivoResolucion: varchar("motivo_resolucion", { length: 500 }),
    resueltoEn: timestamp("resuelto_en", { withTimezone: true }),
    creadoPor: uuid("creado_por"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contracts_cliente_idx").on(table.clienteId),
    index("contracts_departamento_idx").on(table.departamentoId),
    index("contracts_estado_idx").on(table.estado),
    index("contracts_renovado_de_idx").on(table.renovadoDe),
  ]
);

export type ContractRow = typeof contracts.$inferSelect;
export type NewContractRow = typeof contracts.$inferInsert;