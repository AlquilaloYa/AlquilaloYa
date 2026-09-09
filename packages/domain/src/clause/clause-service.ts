import type { UUID } from "../common/index";
import type {
  Clause,
  ClauseVersion,
} from "./clause";
import {
  CreateClauseInput,
  assertClauseVersionEditable,
} from "./clause";

export interface ClauseRepository {
  createClause(input: CreateClauseInput): Promise<Clause>;
  findVersions(clauseId: UUID): Promise<ClauseVersion[]>;
  findVersionById(versionId: UUID): Promise<ClauseVersion | null>;
  createVersion(clauseId: UUID, version: number, contenido: string): Promise<ClauseVersion>;
  publishVersion(versionId: UUID): Promise<ClauseVersion>;
}

export class ClauseService {
  constructor(private readonly repo: ClauseRepository) {}

  async createClause(input: CreateClauseInput): Promise<Clause> {
    return this.repo.createClause(input);
  }

  /** Crea la siguiente versión de cláusula. */
  async createVersion(clauseId: UUID, contenido: string): Promise<ClauseVersion> {
    const versions = await this.repo.findVersions(clauseId);
    const nextVersion = versions.length + 1;
    return this.repo.createVersion(clauseId, nextVersion, contenido);
  }

  /** Publicar versión de cláusula. */
  async publishVersion(versionId: UUID): Promise<ClauseVersion> {
    const target = await this.repo.findVersionById(versionId);
    if (!target) {
      throw new Error("Versión de cláusula no encontrada");
    }
    assertClauseVersionEditable(target);
    return this.repo.publishVersion(versionId);
  }
}