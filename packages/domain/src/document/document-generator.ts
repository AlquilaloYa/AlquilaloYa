import type { ContractSnapshot } from "../snapshot/index";
import type { GeneratedDocument } from "./document";

/**
 * Motor de generación de documentos.
 * Recibe SOLO datos congelados del snapshot; no consulta datos maestros actuales.
 */
export interface DocumentGenerator {
  generate(input: DocumentGenerationInput): Promise<GeneratedDocument>;
}

export interface DocumentGenerationInput {
  snapshot: ContractSnapshot;
}