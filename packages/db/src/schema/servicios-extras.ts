import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { contracts } from "./contracts";
import { clients } from "./clients";

export const serviciosExtras = pgTable(
  "servicios_extras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clients.id),
    codigoContrato: varchar("codigo_contrato", { length: 50 }),
    tipoServicio: varchar("tipo_servicio", { length: 50 }),
    incluyeInternet: boolean("incluye_internet").notNull().default(false),
    incluyeCargaElectrica: boolean("incluye_carga_electrica").notNull().default(false),
    montoInternet: numeric("monto_internet", { precision: 15, scale: 2 })
      .notNull()
      .default("39.00"),
    montoCargaElectrica: numeric("monto_carga_electrica", { precision: 15, scale: 2 })
      .notNull()
      .default("60.00"),
    montoTotal: numeric("monto_total", { precision: 15, scale: 2 }),
    fechaOpcion: date("fecha_opcion").notNull(),
    fechaPago: date("fecha_pago"),
    departamentoNumero: varchar("departamento_numero", { length: 100 }),
    clienteNombre: varchar("cliente_nombre", { length: 255 }),
    clienteDocumento: varchar("cliente_documento", { length: 50 }),
    estado: varchar("estado", { length: 30 }).notNull().default("PENDIENTE"),
    documentId: uuid("document_id"),
    filename: varchar("filename", { length: 255 }),
    storageKey: text("storage_key"),
    sha256: varchar("sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("servicios_extras_contract_idx").on(table.contractId),
    index("servicios_extras_cliente_idx").on(table.clienteId),
  ]
);

export type ServiciosExtrasRow = typeof serviciosExtras.$inferSelect;
export type NewServiciosExtrasRow = typeof serviciosExtras.$inferInsert;

