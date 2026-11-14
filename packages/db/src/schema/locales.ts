import { sql } from "drizzle-orm";
import { templateVersions } from "./templates";
import {
  check,
  boolean,
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export type LocalContactAttachment = {
  id: string;
  nombre: string;
  tipo: string;
  dataUrl: string;
};

export type LocalContactEmergency = {
  nombre: string;
  parentesco: string;
  telefono: string;
};

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
    pagoAguaPorcentaje: numeric("pago_agua_porcentaje", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    montoJardineria: numeric("monto_jardineria", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    impuestoRentaPorcentaje: numeric("impuesto_renta_porcentaje", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("5.00"),
    letreroAltoCm: numeric("letrero_alto_cm", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    letreroAnchoCm: numeric("letrero_ancho_cm", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    letreroProfundidadCm: numeric("letrero_profundidad_cm", {
      precision: 10,
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
    check(
      "locales_pago_agua_porcentaje_check",
      sql`${table.pagoAguaPorcentaje} between 0 and 100`,
    ),
    check(
      "locales_impuesto_renta_porcentaje_check",
      sql`${table.impuestoRentaPorcentaje} between 0 and 100`,
    ),
    check("locales_monto_jardineria_check", sql`${table.montoJardineria} >= 0`),
    check("locales_letrero_alto_cm_check", sql`${table.letreroAltoCm} >= 0`),
    check("locales_letrero_ancho_cm_check", sql`${table.letreroAnchoCm} >= 0`),
    check(
      "locales_letrero_profundidad_cm_check",
      sql`${table.letreroProfundidadCm} >= 0`,
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
    categoria: varchar("categoria", { length: 40 }).notNull().default("GENERAL"),
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
      "local_files_categoria_check",
      sql`${table.categoria} in ('GENERAL', 'ESPECIFICACIONES_TECNICAS')`,
    ),
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
    tipoPersona: varchar("tipo_persona", { length: 10 }).notNull().default("NATURAL"),
    ruc: varchar("ruc", { length: 20 }).notNull().default(""),
    telefono: varchar("telefono", { length: 30 }).notNull().default(""),
    codigoPais: varchar("codigo_pais", { length: 6 }).notNull().default("51"),
    email: varchar("email", { length: 255 }).notNull().default(""),
    domicilio: varchar("domicilio", { length: 500 }).notNull().default(""),
    nacionalidad: varchar("nacionalidad", { length: 100 }).notNull().default(""),
    contactoEmergencia: jsonb("contacto_emergencia").$type<LocalContactEmergency | null>(),
    mascotas: boolean("mascotas").notNull().default(false),
    mascotasItems: jsonb("mascotas_items").notNull().default([]).$type<string[]>(),
    copiaDni: jsonb("copia_dni").notNull().default([]).$type<LocalContactAttachment[]>(),
    copiaBoletas: jsonb("copia_boletas").notNull().default([]).$type<LocalContactAttachment[]>(),
    copiaAntecedentes: jsonb("copia_antecedentes").notNull().default([]).$type<LocalContactAttachment[]>(),
    clienteActivo: boolean("cliente_activo").notNull().default(true),
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
    check("local_contacts_tipo_persona_check", sql`${table.tipoPersona} in ('NATURAL', 'LEGAL')`),
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
    tipoSeparacion: varchar("tipo", { length: 20 }).notNull().default("500"),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    fecha: date("fecha").notNull(),
    diasTiempo: integer("dias_tiempo").notNull().default(1),
    fechaLimiteManual: timestamp("fecha_limite_manual", { withTimezone: true }),
    garantiaExtendida: boolean("garantia_extendida").notNull().default(false),
    fechaGarantiaExtendida: timestamp("fecha_garantia_extendida", { withTimezone: true }),
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
    check("local_separations_dias_tiempo_check", sql`${table.diasTiempo} >= 1`),
    check(
      "local_separations_estado_check",
      sql`${table.estado} in ('PENDIENTE', 'CONFIRMADA', 'CANCELADA')`,
    ),
    check(
      "local_separations_tipo_check",
      sql`${table.tipoSeparacion} in ('500', 'TOTAL', 'GARANTIA', 'FLUCTUANTE')`,
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
    codigo: varchar("codigo", { length: 50 }).notNull(),
    plantillaVersionId: uuid("plantilla_version_id").references(() => templateVersions.id),
    montoCanon: numeric("monto_canon", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    depositoGarantia: numeric("deposito_garantia", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    fechaInicio: date("fecha_inicio").notNull(),
    fechaFin: date("fecha_fin").notNull(),
    estado: varchar("estado", { length: 30 }).notNull().default("BORRADOR"),
    documentoHtml: text("documento_html"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("local_contracts_reserved_local_key")
      .on(table.localId)
      .where(sql`${table.estado} in ('BORRADOR', 'EMITIDO', 'NOTARIADO_FIRMADO', 'VIGENTE')`),
    index("local_contracts_codigo_idx").on(table.codigo),
    index("local_contracts_contact_id_idx").on(table.contactId),
    index("local_contracts_separation_id_idx").on(table.separationId),
    index("local_contracts_estado_idx").on(table.estado),
    check("local_contracts_monto_canon_check", sql`${table.montoCanon} >= 0`),
    check("local_contracts_garantia_check", sql`${table.depositoGarantia} >= 0`),
    check("local_contracts_mantenimiento_check", sql`${table.mantenimiento} >= 0`),
    check(
      "local_contracts_estado_check",
      sql`${table.estado} in ('BORRADOR', 'EMITIDO', 'NOTARIADO_FIRMADO', 'VIGENTE', 'FINALIZADO', 'ANULADO')`,
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
    tipoAdenda: varchar("tipo", { length: 30 }).notNull().default("ADENDA"),
    fechaFin: date("fecha_fin"),
    montoCanon: numeric("monto_canon", { precision: 15, scale: 2 }),
    documentoHtml: text("documento_html"),
    estado: varchar("estado", { length: 30 }).notNull().default("BORRADOR"),
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
      sql`${table.estado} in ('BORRADOR', 'EMITIDA', 'NOTARIADA_FIRMADA', 'VIGENTE', 'ANULADA')`,
    ),
    check("local_annexes_tipo_check", sql`${table.tipoAdenda} in ('ADENDA', 'ADENDA_EXTENSION')`),
    check("local_annexes_monto_canon_check", sql`${table.montoCanon} is null or ${table.montoCanon} >= 0`),
  ],
);

export const localContractDocuments = pgTable(
  "local_contract_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    separationId: uuid("separation_id").references(() => localSeparations.id, {
      onDelete: "cascade",
    }),
    contractId: uuid("contract_id").references(() => localContracts.id, {
      onDelete: "cascade",
    }),
    annexId: uuid("annex_id").references(() => localAnnexes.id, {
      onDelete: "cascade",
    }),
    tipo: varchar("tipo", { length: 32 }).notNull(),
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
    index("local_contract_documents_local_id_created_idx").on(table.localId, table.createdAt),
    index("local_contract_documents_separation_idx").on(table.separationId, table.tipo),
    index("local_contract_documents_contract_idx").on(table.contractId, table.tipo),
    index("local_contract_documents_annex_idx").on(table.annexId, table.tipo),
    check("local_contract_documents_size_check", sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 12582912`),
    check(
      "local_contract_documents_parent_check",
      sql`num_nonnulls(${table.separationId}, ${table.contractId}, ${table.annexId}) = 1`,
    ),
    check(
      "local_contract_documents_tipo_check",
      sql`${table.tipo} in ('VOUCHER_SEPARACION', 'VOUCHER_GARANTIA_EXTENDIDA', 'VOUCHER_GARANTIA', 'VOUCHER_PRIMERA_MENSUALIDAD', 'CONTRATO_EMITIDO', 'CONTRATO_FIRMADO', 'ADENDA_EMITIDA', 'ADENDA_FIRMADA')`,
    ),
  ],
);

export type LocalPaymentVoucher = {
  nombre: string;
  url: string;
  monto?: number;
  verificadoEn?: string;
  verificadoPor?: string;
};

export const localPayments = pgTable(
  "local_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => localContracts.id, { onDelete: "cascade" }),
    periodo: date("periodo").notNull(),
    monto: numeric("monto", { precision: 15, scale: 2 }).notNull().default("0"),
    mantenimiento: numeric("mantenimiento", { precision: 15, scale: 2 }).notNull().default("0"),
    penalidad: numeric("penalidad", { precision: 15, scale: 2 }).notNull().default("0"),
    reciboLuzMonto: numeric("recibo_luz_monto", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    reciboAguaMonto: numeric("recibo_agua_monto", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    pagoLuzPorcentaje: numeric("pago_luz_porcentaje", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    pagoAguaPorcentaje: numeric("pago_agua_porcentaje", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    pagoLuz: numeric("pago_luz", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    pagoAgua: numeric("pago_agua", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    montoPagado: numeric("monto_pagado", { precision: 15, scale: 2 }).notNull().default("0"),
    diasIndulgencia: integer("dias_indulgencia").notNull().default(0),
    estado: varchar("estado", { length: 20 }).notNull().default("PENDIENTE"),
    fechaPago: date("fecha_pago"),
    voucherVerificadoEn: timestamp("voucher_verificado_en", { withTimezone: true }),
    voucherVerificadoPor: varchar("voucher_verificado_por", { length: 255 }),
    vouchers: jsonb("vouchers").notNull().default([]).$type<LocalPaymentVoucher[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("local_payments_contract_periodo_key").on(table.contractId, table.periodo),
    index("local_payments_local_periodo_idx").on(table.localId, table.periodo),
    index("local_payments_estado_periodo_idx").on(table.localId, table.estado, table.periodo),
    check(
      "local_payments_recibos_monto_check",
      sql`${table.reciboLuzMonto} >= 0 and ${table.reciboAguaMonto} >= 0`,
    ),
    check(
      "local_payments_recibos_porcentaje_check",
      sql`${table.pagoLuzPorcentaje} between 0 and 100 and ${table.pagoAguaPorcentaje} between 0 and 100`,
    ),
    check(
      "local_payments_servicios_monto_check",
      sql`${table.pagoLuz} >= 0 and ${table.pagoAgua} >= 0`,
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
