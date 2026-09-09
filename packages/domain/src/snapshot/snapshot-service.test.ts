import { describe, expect, it } from "vitest";
import { SnapshotService, type SnapshotRepository } from "./snapshot-service";
import type { ContractSnapshot, ContractSnapshotData } from "./snapshot";

function makeData(overrides: Partial<ContractSnapshotData> = {}): ContractSnapshotData {
  return {
    codigoContrato: "LEX-0100",
    plantillaVersionId: "plantilla-v1",
    datosCliente: { nombres: "Juan", apellidos: "Pérez", documento: "D12345678" },
    datosDepartamento: { nombre: "Comercial" },
    datosContrato: { montoCanonMensual: "1500.00" },
    clausulas: [{ versionId: "clause-v1", contenido: "Cláusula 1" }],
    anexos: [{ versionId: "annex-v1", contenido: "Anexo A" }],
    ...overrides,
  };
}

function makeRepo(): { repo: SnapshotRepository; getSnapshot: () => ContractSnapshot | null } {
  let store: ContractSnapshot | null = null;
  return {
    getSnapshot: () => store,
    repo: {
      async create(input) {
        store = {
          ...input,
          id: "snap-1",
          inmutable: false,
          emitidoEn: null,
          createdAt: new Date().toISOString(),
        };
        return store;
      },
      async findById(id) {
        return store && store.id === id ? store : null;
      },
      async markImmutable(id, emitidoEn) {
        if (!store || store.id !== id) {
          throw new Error("no encontrado");
        }
        store = { ...store, inmutable: true, emitidoEn };
        return store;
      },
    },
  };
}

describe("SnapshotService", () => {
  it("conserva todos los datos usados en la emisión", async () => {
    const { repo, getSnapshot } = makeRepo();
    const service = new SnapshotService(repo);

    const data = makeData();
    const result = await service.create(data);

    expect(result.codigoContrato).toBe("LEX-0100");
    const snap = getSnapshot();
    expect(snap?.datosCliente).toEqual(data.datosCliente);
    expect(snap?.datosDepartamento).toEqual(data.datosDepartamento);
    expect(snap?.datosContrato).toEqual(data.datosContrato);
    expect(snap?.clausulas).toHaveLength(1);
    expect(snap?.anexos).toHaveLength(1);
  });

  it("finalizeEmission vuelve el snapshot inmutable", async () => {
    const { repo } = makeRepo();
    const service = new SnapshotService(repo);
    const result = await service.create(makeData());

    const snap = await service.finalizeEmission(result.id);
    expect(snap.inmutable).toBe(true);
    expect(snap.emitidoEn).not.toBeNull();
  });

  it("no permite editar un snapshot inmutable", async () => {
    const { repo } = makeRepo();
    const service = new SnapshotService(repo);
    const result = await service.create(makeData());
    await service.finalizeEmission(result.id);

    await expect(service.finalizeEmission(result.id)).rejects.toThrow(/inmutable/);
  });

  it("cambiar datos maestros no altera el snapshot emitido", async () => {
    const { repo } = makeRepo();
    const service = new SnapshotService(repo);
    const result = await service.create(makeData());
    await service.finalizeEmission(result.id);

    const altered = makeData({ datosContrato: { montoCanonMensual: "9999.99" } });
    await expect(service.assertNotAltered(result.id, altered)).rejects.toThrow(/no se pueden alterar/i);
  });
});