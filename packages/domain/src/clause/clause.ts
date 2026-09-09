import type { AuditableEntity, UUID } from "../common/index";

export const ClauseVersionState = {
  BORRADOR: "BORRADOR",
  PUBLICADA: "PUBLICADA",
} as const;

export type ClauseVersionState =
  (typeof ClauseVersionState)[keyof typeof ClauseVersionState];

export interface Clause extends AuditableEntity {
  id: UUID;
  clave: string;
  nombre: string;
}

export interface ClauseVersion {
  id: UUID;
  clauseId: UUID;
  version: number;
  contenido: string;
  publicada: ClauseVersionState;
  createdAt: string;
}

export type CreateClauseInput = Omit<Clause, "id" | "createdAt" | "updatedAt">;

export function assertClauseVersionEditable(
  version: Pick<ClauseVersion, "publicada">
): void {
  if (version.publicada === ClauseVersionState.PUBLICADA) {
    throw new Error("La versión de cláusula publicada no puede editarse");
  }
}