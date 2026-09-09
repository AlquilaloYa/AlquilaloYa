import { describe, expect, it } from "vitest";
import {
  ContractService,
  type ContractRepository,
  type SnapshotPort,
} from "./contract-service";
import type {
  Contract,
  CreateContractInput,
  ContractWithRelations,
} from "./contract";
import { ContractStatus } from "./enums";
import type { ContractSnapshotData } from "../snapshot/index";

const CLIENTE = { id: "cliente-1" } as never;
const DEPARTAMENTO = { id: "depto-1" } as never;
const PLANTILLA = { id: "plantilla-v1" } as never;

function makeInput(overrides: Partial<CreateContractInput> = {}): CreateContractInput {
  return {
    codigoContrato: "LEX-0001",
    clienteId: "cliente-1",
    departamentoId: "depto-1",
    plantillaVersionId: "plantilla-v1",
    montoCanonMensual: "1500.00",
    depositoGarantia: "300.00",
    mantenimiento: "80.00",
    fechaInicio: "2024-01-01",
    fechaFin: "2025-01-01",
    separacion: true,
    separacionDetalle: null,
    copiaDni: [],
    muebleriaItems: [],
    mascotasItems: [],
    ...overrides,
  };
}

function makeRepo(initial: Contract | null = null): {
  repo: ContractRepository;
  store: Contract | null;
} {
  let store = initial;
  const snapshotRefs: string[] = [];
  return {
    store,
    repo: {
      async findById(id: string) {
        return store && store.id === id ? store : null;
      },
      async findWithRelations(id: string) {
        if (!store || store.id !== id) {
          return null;
        }
        return {
          ...store,
          cliente: CLIENTE,
          departamento: DEPARTAMENTO,
          plantillaVersion: PLANTILLA,
          snapshot: null,
        } as ContractWithRelations;
      },
      async create(input: CreateContractInput) {
        const created: Contract = {
          ...input,
          id: "contract-1",
          estado: ContractStatus.BORRADOR,
          snapshotId: null,
          creadoPor: null,
          renovadoDe: input.renovadoDe ?? null,
          motivoResolucion: null,
          resueltoEn: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store = created;
        return created;
      },
      async update(id: string, changes) {
        if (!store || store.id !== id) {
          throw new Error("no encontrado");
        }
        store = { ...store, ...changes, updatedAt: new Date().toISOString() };
        return store;
      },
      async updateEstado(id: string, estado: ContractStatus) {
        if (!store || store.id !== id) {
          throw new Error("no encontrado");
        }
        store = { ...store, estado };
        return store;
      },
      async setSnapshot(id: string, snapshotId: string) {
        if (!store || store.id !== id) {
          throw new Error("no encontrado");
        }
        snapshotRefs.push(snapshotId);
        store = { ...store, snapshotId };
        return store;
      },
      async resolve(id: string, motivo: string) {
        if (!store || store.id !== id) {
          throw new Error("no encontrado");
        }
        store = {
          ...store,
          estado: ContractStatus.RESUELTO,
          motivoResolucion: motivo,
          resueltoEn: new Date().toISOString(),
        };
        return store;
      },
      async countRenovaciones() {
        return 0;
      },
    },
  };
}

function makeSnapshotPort(): SnapshotPort {
  const created: ContractSnapshotData[] = [];
  return {
    async create(data) {
      created.push(data);
      return { id: "snap-1", codigoContrato: data.codigoContrato };
    },
    async assertInmutable() {
      /* noop */
    },
  };
}

function collectEvents() {
  const events: string[] = [];
  return {
    events,
    sink: (e: { type: string }) => {
      events.push(e.type);
    },
  };
}

describe("ContractService", () => {
  it("createContract: crea un borrador y registra CONTRACT_CREATED", async () => {
    const { repo } = makeRepo();
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const created = await service.createContract(makeInput());

    expect(created.estado).toBe(ContractStatus.BORRADOR);
    expect(created.snapshotId).toBeNull();
    expect(events).toContain("CONTRACT_CREATED");
  });

  it("updateDraft: permite editar un borrador", async () => {
    const created = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(makeInput());
    const { repo } = makeRepo(created);
    const service = new ContractService(repo, makeSnapshotPort());

    const updated = await service.updateDraft(created.id, {
      montoCanonMensual: "2000.00",
    });

    expect(updated.montoCanonMensual).toBe("2000.00");
  });

  it("updateDraft: rechaza editar un contrato FIRMADO", async () => {
    const { repo } = makeRepo({
      ...makeDirectContract(ContractStatus.FIRMADO),
    } as Contract);
    const service = new ContractService(repo, makeSnapshotPort());

    await expect(
      service.updateDraft("contract-firmado", { montoCanonMensual: "999.00" })
    ).rejects.toThrow(/BORRADOR/);
  });

  it("updateDraft: rechaza editar un contrato emitido (con snapshot)", async () => {
    const { repo } = makeRepo({
      ...makeDirectContract(ContractStatus.EMITIDO, "snap-x"),
    } as Contract);
    const service = new ContractService(repo, makeSnapshotPort());

    await expect(
      service.updateDraft("contract-emitido", { montoCanonMensual: "999.00" })
    ).rejects.toThrow();
  });

  it("requestEmission: pasa de BORRADOR a PENDIENTE_EMISION y registra evento", async () => {
    const created = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(makeInput());
    const { repo } = makeRepo(created);
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const updated = await service.requestEmission(created.id);

    expect(updated.estado).toBe(ContractStatus.PENDIENTE_EMISION);
    expect(events).toContain("CONTRACT_EMISSION_REQUESTED");
  });

  it("emitContract: crea snapshot y pasa a EMITIDO registrando SNAPSHOT_CREATED y CONTRACT_EMITTED", async () => {
    const created = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(makeInput());
    const { repo } = makeRepo(created);
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const pending = await service.requestEmission(created.id);
    await repo.updateEstado(pending.id, ContractStatus.PENDIENTE_EMISION);
    const emitted = await service.emitContract(
      { ...created, estado: ContractStatus.PENDIENTE_EMISION } as ContractWithRelations
    );

    expect(emitted.estado).toBe(ContractStatus.EMITIDO);
    expect(emitted.snapshotId).toBe("snap-1");
    expect(events).toContain("SNAPSHOT_CREATED");
    expect(events).toContain("CONTRACT_EMITTED");
  });

  it("buildClausulas: genera cláusulas de mueblería y mascotas desde el contrato", async () => {
    const created = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(
      makeInput({
        muebleriaItems: ["01 puerta", "01 isla"],
        mascotasItems: ["Perro"],
      })
    );
    const { repo } = makeRepo(created);
    const captured: ContractSnapshotData[] = [];
    const snapPort: SnapshotPort = {
      async create(data) {
        captured.push(data);
        return { id: "snap-x", codigoContrato: data.codigoContrato };
      },
      async assertInmutable() {},
    };
    const service = new ContractService(repo, snapPort);

    await service.emitContract(
      { ...created, estado: ContractStatus.PENDIENTE_EMISION } as ContractWithRelations
    );

    const clausulas = captured[0]!.clausulas.map((c) => c.contenido).join("\n");
    expect(clausulas).toContain("CLÁUSULA DE INVENTARIO DE MUEBLES");
    expect(clausulas).toContain("01 puerta, 01 isla");
    expect(clausulas).toContain("CLÁUSULA DE MASCOTAS");
    expect(clausulas).toContain("Perro");

    const datos = captured[0]!.datosContrato as Record<string, unknown>;
    expect(datos.muebleriaItems).toEqual(["01 puerta", "01 isla"]);
    expect(datos.mascotasItems).toEqual(["Perro"]);
  });

  it("buildClausulas: incluye cláusulas en blanco (—) cuando no hay datos", async () => {
    const created = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(makeInput());
    const { repo } = makeRepo(created);
    const captured: ContractSnapshotData[] = [];
    const snapPort: SnapshotPort = {
      async create(data) {
        captured.push(data);
        return { id: "snap-y", codigoContrato: data.codigoContrato };
      },
      async assertInmutable() {},
    };
    const service = new ContractService(repo, snapPort);

    await service.emitContract(
      { ...created, estado: ContractStatus.PENDIENTE_EMISION } as ContractWithRelations
    );

    const clausulas = captured[0]!.clausulas.map((c) => c.contenido).join("\n");
    // Ambas cláusulas presentes pero con listado vacío.
    expect(clausulas).toMatch(/muebles y enseres: —\./);
    expect(clausulas).toMatch(/mascotas: —\./);
  });

  it("emitContract: rechaza emitir desde FIRMADO (transición inválida)", async () => {
    const { repo } = makeRepo(makeDirectContract(ContractStatus.FIRMADO) as Contract);
    const service = new ContractService(repo, makeSnapshotPort());

    const firmado = makeDirectContract(ContractStatus.FIRMADO) as Contract;
    await expect(
      service.emitContract(firmado as ContractWithRelations)
    ).rejects.toThrow();
  });

  it("cancelContract: permite cancelar desde BORRADOR, rechaza desde FIRMADO", async () => {
    const borrador = await new ContractService(
      makeRepo().repo,
      makeSnapshotPort()
    ).createContract(makeInput());
    const { repo } = makeRepo(borrador);
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const cancelled = await service.cancelContract(borrador.id);
    expect(cancelled.estado).toBe(ContractStatus.CANCELADO);
    expect(events).toContain("CONTRACT_CANCELLED");

    const firmadoRepo = makeRepo(makeDirectContract(ContractStatus.FIRMADO) as Contract);
    const firmadoService = new ContractService(firmadoRepo.repo, makeSnapshotPort());
    await expect(firmadoService.cancelContract("contract-firmado")).rejects.toThrow();
  });

  it("requestSignature: EMITIDO -> PENDIENTE_FIRMA (requiere snapshot)", async () => {
    const { repo } = makeRepo(makeDirectContract(ContractStatus.EMITIDO, "snap-1"));
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const updated = await service.requestSignature("contract-firmado");
    expect(updated.estado).toBe(ContractStatus.PENDIENTE_FIRMA);
    expect(events).toContain("CONTRACT_SIGNATURE_REQUESTED");
  });

  it("requestSignature: rechaza sin snapshot emitido", async () => {
    const { repo } = makeRepo(makeDirectContract(ContractStatus.EMITIDO));
    const service = new ContractService(repo, makeSnapshotPort());
    await expect(service.requestSignature("contract-firmado")).rejects.toThrow(/emitirse/);
  });

  it("signContract: PENDIENTE_FIRMA -> FIRMADO", async () => {
    const { repo } = makeRepo(
      makeDirectContract(ContractStatus.PENDIENTE_FIRMA, "snap-1")
    );
    const { events, sink } = collectEvents();
    const service = new ContractService(repo, makeSnapshotPort(), sink);

    const signed = await service.signContract("contract-firmado");
    expect(signed.estado).toBe(ContractStatus.FIRMADO);
    expect(events).toContain("CONTRACT_SIGNED");
  });

  it("signContract: rechaza desde BORRADOR (transición inválida)", async () => {
    const { repo } = makeRepo(makeDirectContract(ContractStatus.BORRADOR));
    const service = new ContractService(repo, makeSnapshotPort());
    await expect(service.signContract("contract-firmado")).rejects.toThrow();
  });
});

function makeDirectContract(
  estado: ContractStatus,
  snapshotId: string | null = null
): Contract {
  return {
    id: "contract-firmado",
    codigoContrato: "LEX-0002",
    clienteId: "cliente-1",
    departamentoId: "depto-1",
    plantillaVersionId: "plantilla-v1",
    montoCanonMensual: "1500.00",
    depositoGarantia: "300.00",
    mantenimiento: "80.00",
    fechaInicio: "2024-01-01",
    fechaFin: "2025-01-01",
    estado,
    snapshotId,
    renovadoDe: null,
    separacion: true,
    separacionDetalle: null,
    copiaDni: [],
    muebleriaItems: [],
    mascotasItems: [],
    motivoResolucion: null,
    resueltoEn: null,
    creadoPor: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}