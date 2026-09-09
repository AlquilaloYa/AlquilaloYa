import type { UUID } from "../common/index";

/** Datos congelados de un contrato al momento de emitirlo. */
export interface ContractSnapshot {
  id: UUID;
  codigoContrato: string;
  plantillaVersionId: UUID;
  datosCliente: Record<string, unknown>;
  datosDepartamento: Record<string, unknown>;
  datosContrato: Record<string, unknown>;
  clausulas: Array<{ versionId: UUID; contenido: string }>;
  anexos: Array<{ versionId: UUID; contenido: string }>;
  inmutable: boolean;
  emitidoEn: string | null;
  createdAt: string;
}

export type ContractSnapshotData = Omit<
  ContractSnapshot,
  "id" | "inmutable" | "emitidoEn" | "createdAt"
>;

export function assertSnapshotEditable(snapshot: Pick<ContractSnapshot, "inmutable">): void {
  if (snapshot.inmutable) {
    throw new Error("El snapshot ya fue emitido y es inmutable");
  }
}