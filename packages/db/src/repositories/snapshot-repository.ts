import { eq } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  ContractSnapshot,
  ContractSnapshotData,
  SnapshotRepository,
  UUID,
} from "@contract/domain";

type SnapshotRow = typeof schema.contractSnapshots.$inferSelect;

function toDomain(s: SnapshotRow): ContractSnapshot {
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

/** Repositorio Drizzle de snapshots (SnapshotRepository). */
export class DrizzleSnapshotRepository implements SnapshotRepository {
  async create(input: ContractSnapshotData): Promise<ContractSnapshot> {
    const [row] = await db
      .insert(schema.contractSnapshots)
      .values({
        codigoContrato: input.codigoContrato,
        plantillaVersionId: input.plantillaVersionId,
        datosCliente: input.datosCliente,
        datosDepartamento: input.datosDepartamento,
        datosContrato: input.datosContrato,
        clausulas: input.clausulas as unknown as Record<string, unknown>,
        anexos: input.anexos as unknown as Record<string, unknown>,
      })
      .returning();
    if (!row) {
      throw new Error("No se pudo crear el snapshot");
    }
    return toDomain(row);
  }

  async findById(id: UUID): Promise<ContractSnapshot | null> {
    const [row] = await db
      .select()
      .from(schema.contractSnapshots)
      .where(eq(schema.contractSnapshots.id, id));
    return row ? toDomain(row) : null;
  }

  async markImmutable(id: UUID, emitidoEn: string): Promise<ContractSnapshot> {
    const [row] = await db
      .update(schema.contractSnapshots)
      .set({ inmutable: true, emitidoEn: new Date(emitidoEn) })
      .where(eq(schema.contractSnapshots.id, id))
      .returning();
    if (!row) {
      throw new Error("Snapshot no encontrado");
    }
    return toDomain(row);
  }
}

/**
 * Adaptador de snapshot con la firma que espera ContractService (SnapshotPort):
 * create devuelve { id, codigoContrato }. El snapshot se crea inmutado:
 * al emitir el contrato, la fotografía queda congelada de inmediato.
 */
export class ContractSnapshotPort {
  constructor(private readonly repo: DrizzleSnapshotRepository) {}

  async create(
    data: ContractSnapshotData
  ): Promise<{ id: UUID; codigoContrato: string }> {
    const created = await this.repo.create(data);
    await this.repo.markImmutable(created.id, new Date().toISOString());
    return { id: created.id, codigoContrato: created.codigoContrato };
  }

  async assertInmutable(id: UUID): Promise<void> {
    const snapshot = await this.repo.findById(id);
    if (!snapshot) {
      throw new Error("Snapshot no encontrado");
    }
    if (!snapshot.inmutable) {
      throw new Error("El snapshot debe ser inmutable");
    }
  }
}