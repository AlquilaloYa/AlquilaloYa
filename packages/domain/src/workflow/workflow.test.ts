import { describe, expect, it } from "vitest";
import {
  suggestedActionForQueue,
  WorkflowQueue,
  WorkflowService,
  type WorkflowBoard,
  type WorkflowRepository,
} from "./workflow";

describe("suggestedActionForQueue", () => {
  it("mapea cada cola operativa a la acción de dominio", () => {
    expect(suggestedActionForQueue(WorkflowQueue.PENDIENTE_EMISION)?.action).toBe(
      "emit"
    );
    expect(suggestedActionForQueue(WorkflowQueue.EMITIDO)?.action).toBe(
      "requestFirma"
    );
    expect(suggestedActionForQueue(WorkflowQueue.PENDIENTE_FIRMA)?.action).toBe(
      "firmar"
    );
    expect(suggestedActionForQueue(WorkflowQueue.POR_VENCER)).toBeNull();
  });
});

describe("WorkflowService", () => {
  it("delega el tablero al repositorio", async () => {
    const board: WorkflowBoard = {
      pendienteEmision: [],
      emitido: [],
      pendienteFirma: [],
      porVencer: [],
    };
    const repo: WorkflowRepository = {
      listBoard: async () => board,
    };
    const service = new WorkflowService(repo);
    await expect(service.listBoard()).resolves.toBe(board);
  });
});
