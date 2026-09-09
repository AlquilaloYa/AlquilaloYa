import type { UUID } from "../common/index";
import type { Annex, AnnexVersion, CreateAnnexInput } from "./annex";
import { assertAnnexVersionEditable } from "./annex";

export interface AnnexRepository {
  createAnnex(input: CreateAnnexInput): Promise<Annex>;
  findActiveByDepartment(departamentoId: UUID): Promise<Annex[]>;
  findVersions(annexId: UUID): Promise<AnnexVersion[]>;
  findVersionById(versionId: UUID): Promise<AnnexVersion | null>;
  createVersion(annexId: UUID, version: number, contenido: string): Promise<AnnexVersion>;
  publishVersion(versionId: UUID): Promise<AnnexVersion>;
}

export class AnnexService {
  constructor(private readonly repo: AnnexRepository) {}

  async createAnnex(input: CreateAnnexInput): Promise<Annex> {
    return this.repo.createAnnex(input);
  }

  /** Anexos activos del departamento. */
  async activeForDepartment(departamentoId: UUID): Promise<Annex[]> {
    return this.repo.findActiveByDepartment(departamentoId);
  }

  /** Crea la siguiente versión de anexo. */
  async createVersion(annexId: UUID, contenido: string): Promise<AnnexVersion> {
    const versions = await this.repo.findVersions(annexId);
    const nextVersion = versions.length + 1;
    return this.repo.createVersion(annexId, nextVersion, contenido);
  }

  /** Publicar versión de anexo. */
  async publishVersion(versionId: UUID): Promise<AnnexVersion> {
    const target = await this.repo.findVersionById(versionId);
    if (!target) {
      throw new Error("Versión de anexo no encontrada");
    }
    assertAnnexVersionEditable(target);
    return this.repo.publishVersion(versionId);
  }
}