import type { ContractStatus } from "../contract/enums";

export const WorkflowQueue = {
  PENDIENTE_EMISION: "PENDIENTE_EMISION",
  EMITIDO: "EMITIDO",
  PENDIENTE_FIRMA: "PENDIENTE_FIRMA",
  POR_VENCER: "POR_VENCER",
} as const;

export type WorkflowQueue = (typeof WorkflowQueue)[keyof typeof WorkflowQueue];

export interface WorkflowTask {
  id: string;
  queue: WorkflowQueue;
  contractId: string;
  codigoContrato: string;
  clienteNombre: string;
  departamentoNombre: string;
  estado: ContractStatus;
  fechaFin: string | null;
  updatedAt: string;
}

export interface WorkflowBoard {
  pendienteEmision: WorkflowTask[];
  emitido: WorkflowTask[];
  pendienteFirma: WorkflowTask[];
  porVencer: WorkflowTask[];
}

export interface WorkflowRepository {
  listBoard(): Promise<WorkflowBoard>;
}

export function suggestedActionForQueue(
  queue: WorkflowQueue
): { action: string; label: string } | null {
  switch (queue) {
    case WorkflowQueue.PENDIENTE_EMISION:
      return { action: "emit", label: "Emitir contrato" };
    case WorkflowQueue.EMITIDO:
      return { action: "requestFirma", label: "Solicitar firma" };
    case WorkflowQueue.PENDIENTE_FIRMA:
      return { action: "firmar", label: "Firmar contrato" };
    default:
      return null;
  }
}

export class WorkflowService {
  constructor(private readonly repo: WorkflowRepository) {}

  listBoard(): Promise<WorkflowBoard> {
    return this.repo.listBoard();
  }
}
