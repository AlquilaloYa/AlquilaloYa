import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  bigint,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const locales = pgTable(
  "locales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: varchar("codigo", { length: 32 }).notNull().unique(),
    numero: varchar("numero", { length: 2 }).notNull(),
    sede: varchar("sede", { length: 20 }).notNull(),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    areaM2: numeric("area_m2", { precision: 10, scale: 2 }).notNull().default("0"),
    precioAlquiler: numeric("precio_alquiler", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    garantia: numeric("garantia", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    servicios: text("servicios").notNull().default(""),
    pagoLuzPorcentaje: numeric("pago_luz_porcentaje", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "locales_codigo_check",
      sql`${table.codigo} in ('BEN2195-A1', 'BEN2195-A2', 'BEN2195-A3', 'ANG170-A1', 'ANG170-A2', 'ANG170-A3', 'ANG170-A4', 'ANG170-A5')`,
    ),
    check(
      "locales_sede_check",
      sql`${table.sede} in ('Benavides', 'Angamos')`,
    ),
    check(
      "locales_numero_check",
      sql`${table.numero} in ('A1', 'A2', 'A3', 'A4', 'A5')`,
    ),
    check(
      "locales_codigo_sede_check",
      sql`(${table.codigo} like 'BEN2195-%' and ${table.sede} = 'Benavides') or (${table.codigo} like 'ANG170-%' and ${table.sede} = 'Angamos')`,
    ),
    check("locales_area_m2_check", sql`${table.areaM2} >= 0`),
    check("locales_precio_alquiler_check", sql`${table.precioAlquiler} >= 0`),
    check("locales_garantia_check", sql`${table.garantia} >= 0`),
    check("locales_mantenimiento_check", sql`${table.mantenimiento} >= 0`),
    check(
      "locales_pago_luz_porcentaje_check",
      sql`${table.pagoLuzPorcentaje} between 0 and 100`,
    ),
    index("locales_sede_idx").on(table.sede),
    uniqueIndex("locales_sede_numero_unique").on(table.sede, table.numero),
    check(
      "locales_codigo_numero_check",
      sql`split_part(${table.codigo}, '-', 2) = ${table.numero}`,
    ),
  ],
);

export const localFiles = pgTable(
  "local_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedBy: varchar("uploaded_by", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_files_local_id_idx").on(table.localId),
    check(
      "local_files_size_bytes_check",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 12582912`,
    ),
    check(
      "local_files_mime_size_check",
      sql`(${table.mimeType} = 'application/pdf' and ${table.sizeBytes} <= 8388608) or (${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp') and ${table.sizeBytes} <= 12582912)`,
    ),
  ],
);

export const localContacts = pgTable(
  "local_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombres: varchar("nombres", { length: 255 }).notNull(),
    apellidos: varchar("apellidos", { length: 255 }).notNull().default(""),
    documento: varchar("documento", { length: 50 }).notNull().default(""),
    telefono: varchar("telefono", { length: 30 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_contacts_local_id_idx").on(table.localId),
    index("local_contacts_documento_idx").on(table.documento),
  ],
);

export const localSeparations = pgTable(
  "local_separations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => localContacts.id, { onDelete: "restrict" }),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    fecha: date("fecha").notNull(),
    observaciones: text("observaciones").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_separations_local_id_idx").on(table.localId),
    index("local_separations_contact_id_idx").on(table.contactId),
    index("local_separations_estado_idx").on(table.estado),
    check("local_separations_monto_check", sql`${table.monto} >= 0`),
    check(
      "local_separations_estado_check",
      sql`${table.estado} in ('PENDIENTE', 'CONFIRMADA', 'CANCELADA')`,
    ),
  ],
);

export const localContracts = pgTable(
  "local_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => localContacts.id, { onDelete: "restrict" }),
    separationId: uuid("separation_id").references(() => localSeparations.id, {
      onDelete: "set null",
    }),
    codigo: varchar("codigo", { length: 50 }).notNull().unique(),
    montoCanon: numeric("monto_canon", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    fechaInicio: date("fecha_inicio").notNull(),
    fechaFin: date("fecha_fin").notNull(),
    estado: varchar("estado", { length: 20 }).notNull().default("BORRADOR"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_contracts_local_id_idx").on(table.localId),
    index("local_contracts_contact_id_idx").on(table.contactId),
    index("local_contracts_separation_id_idx").on(table.separationId),
    index("local_contracts_estado_idx").on(table.estado),
    check("local_contracts_monto_canon_check", sql`${table.montoCanon} >= 0`),
    check(
      "local_contracts_estado_check",
      sql`${table.estado} in ('BORRADOR', 'VIGENTE', 'FINALIZADO', 'ANULADO')`,
    ),
    check("local_contracts_fechas_check", sql`${table.fechaFin} >= ${table.fechaInicio}`),
  ],
);

export const localAnnexes = pgTable(
  "local_annexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => localContracts.id, { onDelete: "cascade" }),
    numero: varchar("numero", { length: 50 }).notNull(),
    descripcion: text("descripcion").notNull(),
    fecha: date("fecha").notNull(),
    estado: varchar("estado", { length: 20 }).notNull().default("BORRADOR"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_annexes_local_id_idx").on(table.localId),
    index("local_annexes_contract_id_idx").on(table.contractId),
    check(
      "local_annexes_estado_check",
      sql`${table.estado} in ('BORRADOR', 'VIGENTE', 'ANULADA')`,
    ),
  ],
);

export const localServices = pgTable(
  "local_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 255 }).notNull(),
    descripcion: text("descripcion").notNull().default(""),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    frecuencia: varchar("frecuencia", { length: 30 }).notNull().default("MENSUAL"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("local_services_local_id_idx").on(table.localId),
    index("local_services_activo_idx").on(table.activo),
    check("local_services_monto_check", sql`${table.monto} >= 0`),
    check(
      "local_services_frecuencia_check",
      sql`${table.frecuencia} in ('UNICO', 'MENSUAL', 'ANUAL')`,
    ),
  ],
);

export type LocalRow = typeof locales.$inferSelect;
export type NewLocalRow = typeof locales.$inferInsert;
export type LocalFileRow = typeof localFiles.$inferSelect;
export type LocalContactRow = typeof localContacts.$inferSelect;
export type LocalSeparationRow = typeof localSeparations.$inferSelect;
export type LocalContractRow = typeof localContracts.$inferSelect;
export type LocalAnnexRow = typeof localAnnexes.$inferSelect;
export type LocalServiceRow = typeof localServices.$inferSelect;
