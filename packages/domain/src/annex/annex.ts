import type { AuditableEntity, UUID } from "../common/index";

export interface Annex extends AuditableEntity {
  id: UUID;
  departamentoId: UUID;
  nombre: string;
  activo: boolean;
}

export interface AnnexVersion {
  id: UUID;
  annexId: UUID;
  version: number;
  contenido: string;
  publicada: boolean;
  publicadoEn: string | null;
  createdAt: string;
}

export type CreateAnnexInput = Omit<Annex, "id" | "createdAt" | "updatedAt">;

export function assertAnnexVersionEditable(
  version: Pick<AnnexVersion, "publicada">
): void {
  if (version.publicada) {
    throw new Error("La versión de anexo publicada no puede editarse");
  }
}