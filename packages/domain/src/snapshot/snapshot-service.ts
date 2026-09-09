import type { UUID } from "../common/index";
import type {
  ContractSnapshot,
  ContractSnapshotData,
} from "./snapshot";
import { assertSnapshotEditable } from "./snapshot";

export interface SnapshotRepository {
  create(input: ContractSnapshotData): Promise<ContractSnapshot>;
  findById(id: UUID): Promise<ContractSnapshot | null>;
  markImmutable(id: UUID, emitidoEn: string): Promise<ContractSnapshot>;
}

/**
 * Servicio de snapshots: crea una fotografía congelada con los datos usados.
 * Un snapshot emitido es inmutable.
 */
export class SnapshotService {
  constructor(private readonly repo: SnapshotRepository) {}

  async create(data: ContractSnapshotData): Promise<{ id: UUID; codigoContrato: string }> {
    const created = await this.repo.create({
      codigoContrato: data.codigoContrato,
      plantillaVersionId: data.plantillaVersionId,
      datosCliente: data.datosCliente,
      datosDepartamento: data.datosDepartamento,
      datosContrato: data.datosContrato,
      clausulas: data.clausulas,
      anexos: data.anexos,
    });
    return { id: created.id, codigoContrato: created.codigoContrato };
  }

  async findById(id: UUID): Promise<ContractSnapshot | null> {
    return this.repo.findById(id);
  }

  /** Al emitir, el snapshot se vuelve inmutable. */
  async finalizeEmission(id: UUID): Promise<ContractSnapshot> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Snapshot no encontrado");
    }
    assertSnapshotEditable(current);
    return this.repo.markImmutable(id, new Date().toISOString());
  }

  /** Cambiar datos maestros no debe alterar el snapshot inmutable. */
  async assertNotAltered(id: UUID, data: ContractSnapshotData): Promise<void> {
    const snapshot = await this.repo.findById(id);
    if (!snapshot) {
      throw new Error("Snapshot no encontrado");
    }
    if (
      JSON.stringify(snapshot.datosContrato) !== JSON.stringify(data.datosContrato)
    ) {
      throw new Error("No se pueden alterar los datos de un snapshot emitido");
    }
  }
}