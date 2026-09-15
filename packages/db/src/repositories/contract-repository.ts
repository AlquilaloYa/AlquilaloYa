import { eq, like } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  Contract,
  ContractRepository,
  ContractStatus,
  ContractWithRelations,
  CreateContractInput,
  UpdateDraftInput,
  Client,
  Department,
  ContractSnapshot as DomainSnapshot,
  TemplateVersion,
  UUID,
} from "@contract/domain";

type ContractRow = typeof schema.contracts.$inferSelect;

function toDomain(row: ContractRow): Contract {
  return {
    id: row.id,
    codigoContrato: row.codigoContrato,
    clienteId: row.clienteId,
    departamentoId: row.departamentoId,
    plantillaVersionId: row.plantillaVersionId,
    montoCanonMensual: row.montoCanonMensual,
    depositoGarantia: row.depositoGarantia,
    mantenimiento: row.mantenimiento,
    fechaInicio: new Date(row.fechaInicio).toISOString().slice(0, 10),
    fechaFin: new Date(row.fechaFin).toISOString().slice(0, 10),
    estado: row.estado as ContractStatus,
    snapshotId: row.snapshotId,
    renovadoDe: row.renovadoDe,
    separacion: row.separacion,
    separacionDetalle: row.separacionDetalle as Contract["separacionDetalle"],
    copiaDni: Array.isArray(row.copiaDni)
      ? (row.copiaDni as Contract["copiaDni"])
      : [],
    muebleriaItems: Array.isArray(row.muebleriaItems)
      ? (row.muebleriaItems as string[]).map(String)
      : [],
    mascotasItems: Array.isArray(row.mascotasItems)
      ? (row.mascotasItems as string[]).map(String)
      : [],
    motivoResolucion: row.motivoResolucion,
    resueltoEn: row.resueltoEn ? row.resueltoEn.toISOString() : null,
    creadoPor: row.creadoPor,
    createdAt: row.creadoEn.toISOString(),
    updatedAt: row.actualizadoEn.toISOString(),
  };
}

function clientRowToDomain(
  c: typeof schema.clients.$inferSelect
): Client {
  return {
    id: c.id,
    nombres: c.nombres,
    apellidos: c.apellidos,
    documentoIdentidad: c.documentoIdentidad,
    ruc: c.ruc,
    tipoPersona: c.tipoPersona as Client["tipoPersona"],
    email: c.email,
    telefono: c.telefono,
    domicilio: c.domicilio,
    nacionalidad: c.nacionalidad,
    activo: c.activo,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function departmentRowToDomain(
  d: typeof schema.departments.$inferSelect
): Department {
  return {
    id: d.id,
    codigo: d.codigo,
    nombre: d.nombre,
    numero: d.numero,
    tipo: d.tipo,
    personaPago: d.personaPago,
    piso: d.piso,
    precio: d.precio,
    mantenimiento: d.mantenimiento,
    servicios: d.servicios,
    activo: d.activo,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function templateVersionRowToDomain(
  tv: typeof schema.templateVersions.$inferSelect
): TemplateVersion {
  return {
    id: tv.id,
    templateId: tv.templateId,
    version: tv.version,
    contenido: tv.contenido,
    pdfStorageKey: tv.pdfStorageKey ?? null,
    pdfFilename: tv.pdfFilename ?? null,
    publicada: tv.publicada,
    publicadoEn: tv.publicadoEn ? tv.publicadoEn.toISOString() : null,
    createdAt: tv.createdAt.toISOString(),
  };
}

function snapshotRowToDomain(
  s: typeof schema.contractSnapshots.$inferSelect
): DomainSnapshot {
  return {
    id: s.id,
    codigoContrato: s.codigoContrato,
    plantillaVersionId: s.plantillaVersionId,
    datosCliente: s.datosCliente as Record<string, unknown>,
    datosDepartamento: s.datosDepartamento as Record<string, unknown>,
    datosContrato: s.datosContrato as Record<string, unknown>,
    clausulas: Array.isArray(s.clausulas)
      ? (s.clausulas as Array<{ versionId: UUID; contenido: string }>)
      : [],
    anexos: Array.isArray(s.anexos)
      ? (s.anexos as Array<{ versionId: UUID; contenido: string }>)
      : [],
    inmutable: s.inmutable,
    emitidoEn: s.emitidoEn ? s.emitidoEn.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Repositorio Drizzle de contratos, con relaciones cargadas. */
export class DrizzleContractRepository implements ContractRepository {
  async findById(id: UUID): Promise<Contract | null> {
    const [row] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.id, id));
    return row ? toDomain(row) : null;
  }

  async findWithRelations(id: UUID): Promise<ContractWithRelations | null> {
    const [row] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.id, id));
    if (!row) {
      return null;
    }

    const [cliente] = row.clienteId
      ? await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.id, row.clienteId))
      : [];

    const [departamento] = row.departamentoId
      ? await db
          .select()
          .from(schema.departments)
          .where(eq(schema.departments.id, row.departamentoId))
      : [];

    const [plantillaVersion] = row.plantillaVersionId
      ? await db
          .select()
          .from(schema.templateVersions)
          .where(eq(schema.templateVersions.id, row.plantillaVersionId))
      : [];

    const [snapshot] = row.snapshotId
      ? await db
          .select()
          .from(schema.contractSnapshots)
          .where(eq(schema.contractSnapshots.id, row.snapshotId))
      : [];

    if (!cliente || !departamento || !plantillaVersion) {
      throw new Error("Relaciones del contrato incompletas");
    }

    return {
      ...toDomain(row),
      cliente: clientRowToDomain(cliente),
      departamento: departmentRowToDomain(departamento),
      plantillaVersion: templateVersionRowToDomain(plantillaVersion),
      snapshot: snapshot ? snapshotRowToDomain(snapshot) : null,
    };
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const [row] = await db
      .insert(schema.contracts)
      .values({
        codigoContrato: input.codigoContrato,
        clienteId: input.clienteId,
        departamentoId: input.departamentoId,
        plantillaVersionId: input.plantillaVersionId,
        montoCanonMensual: input.montoCanonMensual,
        depositoGarantia: input.depositoGarantia,
        mantenimiento: input.mantenimiento,
        fechaInicio: input.fechaInicio,
        fechaFin: input.fechaFin,
        renovadoDe: input.renovadoDe ?? null,
        separacion: input.separacion,
        separacionDetalle: input.separacionDetalle,
        copiaDni: input.copiaDni,
        muebleriaItems: input.muebleriaItems,
        mascotasItems: input.mascotasItems,
      })
      .returning();
    if (!row) {
      throw new Error("No se pudo crear el contrato");
    }
    return toDomain(row);
  }

  async update(id: UUID, changes: UpdateDraftInput): Promise<Contract> {
    const values: Partial<
      Omit<typeof schema.contracts.$inferInsert, "id">
    > = {};
    if (changes.clienteId !== undefined) values.clienteId = changes.clienteId;
    if (changes.departamentoId !== undefined)
      values.departamentoId = changes.departamentoId;
    if (changes.plantillaVersionId !== undefined)
      values.plantillaVersionId = changes.plantillaVersionId;
    if (changes.montoCanonMensual !== undefined)
      values.montoCanonMensual = changes.montoCanonMensual;
    if (changes.depositoGarantia !== undefined)
      values.depositoGarantia = changes.depositoGarantia;
    if (changes.mantenimiento !== undefined)
      values.mantenimiento = changes.mantenimiento;
    if (changes.fechaInicio !== undefined)
      values.fechaInicio = changes.fechaInicio;
    if (changes.fechaFin !== undefined) values.fechaFin = changes.fechaFin;
    if (changes.separacion !== undefined) values.separacion = changes.separacion;
    if (changes.muebleriaItems !== undefined)
      values.muebleriaItems = changes.muebleriaItems;
    if (changes.mascotasItems !== undefined)
      values.mascotasItems = changes.mascotasItems;

    const [row] = await db
      .update(schema.contracts)
      .set({ ...values, actualizadoEn: new Date() })
      .where(eq(schema.contracts.id, id))
      .returning();
    if (!row) {
      throw new Error("Contrato no encontrado");
    }
    return toDomain(row);
  }

  async resolve(id: UUID, motivo: string): Promise<Contract> {
    const [row] = await db
      .update(schema.contracts)
      .set({
        estado: "RESUELTO" as ContractStatus,
        motivoResolucion: motivo,
        resueltoEn: new Date(),
        actualizadoEn: new Date(),
      })
      .where(eq(schema.contracts.id, id))
      .returning();
    if (!row) {
      throw new Error("Contrato no encontrado");
    }
    return toDomain(row);
  }

  async countRenovaciones(codigoBase: string): Promise<number> {
    const rows = await db
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(like(schema.contracts.codigoContrato, `${codigoBase}-R%`));
    return rows.length;
  }

  async updateEstado(id: UUID, estado: ContractStatus): Promise<Contract> {
    const [row] = await db
      .update(schema.contracts)
      .set({ estado, actualizadoEn: new Date() })
      .where(eq(schema.contracts.id, id))
      .returning();
    if (!row) {
      throw new Error("Contrato no encontrado");
    }
    return toDomain(row);
  }

  async setSnapshot(id: UUID, snapshotId: UUID): Promise<Contract> {
    const [row] = await db
      .update(schema.contracts)
      .set({ snapshotId, actualizadoEn: new Date() })
      .where(eq(schema.contracts.id, id))
      .returning();
    if (!row) {
      throw new Error("Contrato no encontrado");
    }
    return toDomain(row);
  }
}