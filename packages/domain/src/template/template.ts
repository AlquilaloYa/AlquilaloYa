import type { UUID } from "../common/index";
import type { TemplateType } from "../contract/enums";

export interface ContractTemplate {
  id: UUID;
  clave: TemplateType;
  nombre: string;
  activo: boolean;
}

export interface TemplateVersion {
  id: UUID;
  templateId: UUID;
  version: number;
  contenido: string | null;
  pdfStorageKey: string | null;
  pdfFilename: string | null;
  publicada: boolean;
  publicadoEn: string | null;
  createdAt: string;
}

export type CreateTemplateInput = Pick<
  ContractTemplate,
  "clave" | "nombre"
>;

export type CreateTemplateVersionInput = Pick<
  TemplateVersion,
  "templateId"
> & {
  contenido?: string;
  pdfStorageKey?: string;
  pdfFilename?: string;
};

export function assertTemplateVersionEditable(
  version: Pick<TemplateVersion, "publicada">
): void {
  if (version.publicada) {
    throw new Error("La versión de plantilla publicada no puede editarse");
  }
}