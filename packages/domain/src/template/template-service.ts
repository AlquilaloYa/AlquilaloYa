import type { UUID } from "../common/index";
import type {
  ContractTemplate,
  CreateTemplateInput,
  TemplateVersion,
  CreateTemplateVersionInput,
} from "./template";
import { assertTemplateVersionEditable } from "./template";

export interface TemplateRepository {
  listActive(): Promise<ContractTemplate[]>;
  createTemplate(input: CreateTemplateInput): Promise<ContractTemplate>;
  findVersions(templateId: UUID): Promise<TemplateVersion[]>;
  findVersionById(versionId: UUID): Promise<TemplateVersion | null>;
  findLatestPublished(templateId: UUID): Promise<TemplateVersion | null>;
  createVersion(
    templateId: UUID,
    version: number,
    contenido: string | null,
    pdfStorageKey?: string | null,
    pdfFilename?: string | null
  ): Promise<TemplateVersion>;
  publishVersion(versionId: UUID): Promise<TemplateVersion>;
}

export class TemplateService {
  constructor(private readonly repo: TemplateRepository) {}

  async createTemplate(input: CreateTemplateInput): Promise<ContractTemplate> {
    return this.repo.createTemplate(input);
  }

  async listActive(): Promise<ContractTemplate[]> {
    return this.repo.listActive();
  }

  /** Crea la siguiente versión de plantilla. Ninguna versión se edita; se versiona. */
  async createVersion(input: CreateTemplateVersionInput): Promise<TemplateVersion> {
    if (!input.contenido && !input.pdfStorageKey) {
      throw new Error("La versión requiere contenido o un archivo PDF");
    }
    const versions = await this.repo.findVersions(input.templateId);
    const nextVersion = versions.length + 1;
    return this.repo.createVersion(
      input.templateId,
      nextVersion,
      input.contenido ?? null,
      input.pdfStorageKey ?? null,
      input.pdfFilename ?? null
    );
  }

  /** Publicar una versión: a partir de aquí no se edita. */
  async publishVersion(versionId: UUID): Promise<TemplateVersion> {
    const target = await this.repo.findVersionById(versionId);
    if (!target) {
      throw new Error("Versión de plantilla no encontrada");
    }
    assertTemplateVersionEditable(target);
    return this.repo.publishVersion(versionId);
  }

  async latestPublished(templateId: UUID): Promise<TemplateVersion | null> {
    return this.repo.findLatestPublished(templateId);
  }
}