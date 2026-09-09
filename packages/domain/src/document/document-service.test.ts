import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  DocumentService,
  type DocumentRepository,
  type SnapshotReader,
  type DocumentEventSink,
} from "./document-service";
import type { DocumentGenerator } from "./document-generator";
import type {
  StorageConnector,
  DocumentStoragePort,
} from "./storage";
import type { DocumentDomainEvent } from "./domain-events";
import type { ContractSnapshot } from "../snapshot/snapshot";
import type { Document } from "./document";
import { DocumentGeneracionEstado as Estado, DocumentTipo } from "./document";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeSnapshot(overrides: Partial<ContractSnapshot> = {}): ContractSnapshot {
  return {
    id: "snap-1",
    codigoContrato: "CTR-0001",
    plantillaVersionId: "plantilla-v1",
    datosCliente: { nombres: "Juan", apellidos: "Pérez", documento: "D1" },
    datosDepartamento: { nombre: "Comercial" },
    datosContrato: { montoCanonMensual: "1500.00", codigoContrato: "CTR-0001" },
    clausulas: [{ versionId: "clause-v1", contenido: "Cláusula 1" }],
    anexos: [{ versionId: "annex-v1", contenido: "Anexo 1" }],
    inmutable: true,
    emitidoEn: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    contractId: "contract-1",
    snapshotId: "snap-1",
    tipo: DocumentTipo.CONTRATO_PDF,
    version: 1,
    storageKey: null,
    filename: "CTR-0001.pdf",
    mimeType: "application/pdf",
    sizeBytes: null,
    sha256: null,
    estadoGeneracion: Estado.REQUESTED,
    idempotencyKey: "contract:contract-1:document:snap-1",
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Harness {
  service: DocumentService;
  snapshot: ContractSnapshot;
  events: DocumentDomainEvent[];
}

function makeHarness(overrides: {
  snapshot?: ContractSnapshot;
  generator?: DocumentGenerator;
  storage?: StorageConnector;
  documentStore?: DocumentStoragePort;
} = {}): Harness {
  const events: DocumentDomainEvent[] = [];

  const repo: DocumentRepository = {
    async create(input) {
      return makeDocument({
        contractId: input.contractId,
        snapshotId: input.snapshotId,
        tipo: input.tipo,
        filename: input.filename,
        mimeType: input.mimeType,
        idempotencyKey: input.idempotencyKey,
      });
    },
    async findById(id) {
      return id === "doc-1" ? makeDocument() : null;
    },
    async findBySnapshot() {
      return null;
    },
    async findByContract() {
      return [];
    },
  };

  const snapshotReader: SnapshotReader = {
    async findById() {
      return overrides.snapshot ?? makeSnapshot();
    },
  };

  const generator: DocumentGenerator =
    overrides.generator ??
    {
      async generate() {
        const bytes = new Uint8Array(Buffer.from("PDF-CONTENIDO"));
        return {
          bytes,
          mimeType: "application/pdf",
          filename: "CTR-0001.pdf",
          sha256: sha256(bytes),
        };
      },
    };

  const storage: StorageConnector =
    overrides.storage ??
    {
      async put(input) {
        return { key: `key/${input.key}`, sizeBytes: input.bytes.byteLength };
      },
      async get() {
        return new Uint8Array();
      },
      async del() {},
      async getSignedUrl() {
        return "https://example.com/signed";
      },
    };

  const documentStore: DocumentStoragePort =
    overrides.documentStore ??
    {
      async findByIdempotencyKey() {
        return null;
      },
      async markCompleted() {},
      async markFailed() {},
    };

  const sink: DocumentEventSink = async (event) => {
    events.push(event);
  };

  const service = new DocumentService(
    repo,
    snapshotReader,
    generator,
    storage,
    documentStore,
    sink
  );

  return { service, snapshot: overrides.snapshot ?? makeSnapshot(), events };
}

describe("DocumentService", () => {
  it("solicita generación creando el documento y emitiendo el evento", async () => {
    const { service, snapshot, events } = makeHarness();
    const doc = await service.requestGeneration({
      contractId: "contract-1",
      snapshotId: snapshot.id,
    });
    expect(doc.idempotencyKey).toBe("contract:contract-1:document:snap-1");
    expect(doc.estadoGeneracion).toBe(Estado.REQUESTED);
    expect(events.some((e) => e.type === "DOCUMENT_GENERATION_REQUESTED")).toBe(true);
  });

  it("es idempotente: no duplica si la clave de idempotencia ya existe", async () => {
    const existing = makeDocument();
    const store: DocumentStoragePort = {
      async findByIdempotencyKey() {
        return existing;
      },
      async markCompleted() {},
      async markFailed() {},
    };
    const { service, snapshot } = makeHarness({ documentStore: store });
    const doc = await service.requestGeneration({
      contractId: "contract-1",
      snapshotId: snapshot.id,
    });
    expect(doc.id).toBe(existing.id);
  });

  it("rechaza solicitar generación si el snapshot no es inmutable", async () => {
    const { service, snapshot } = makeHarness({
      snapshot: makeSnapshot({ inmutable: false }),
    });
    await expect(
      service.requestGeneration({ contractId: "c1", snapshotId: snapshot.id })
    ).rejects.toThrow(/inmutable/i);
  });

  it("genera el documento: render + storage + hash y emite DOCUMENT_GENERATED", async () => {
    const { service, events } = makeHarness();
    const generated = await service.generate("doc-1");
    expect(typeof generated.sha256).toBe("string");
    expect(generated.sha256.length).toBe(64);
    expect(events.some((e) => e.type === "DOCUMENT_GENERATED")).toBe(true);
  });

  it("no regenera un documento ya completado (idempotencia)", async () => {
    const docStore: DocumentStoragePort = {
      async findByIdempotencyKey() {
        return null;
      },
      async markCompleted() {},
      async markFailed() {},
    };
    const { service } = makeHarness({ documentStore: docStore });
    // Servicio con repo que devuelve documento ya COMPLETED.
    const repo: DocumentRepository = {
      async create() {
        return makeDocument();
      },
      async findById() {
        return makeDocument({ estadoGeneracion: Estado.COMPLETED, sha256: "a".repeat(64) });
      },
      async findBySnapshot() {
        return null;
      },
      async findByContract() {
        return [];
      },
    };
    const service2 = new DocumentService(
      repo,
      { async findById() { return makeSnapshot(); } },
      { async generate() { throw new Error("no debe llamarse"); } },
      {
        async put() { return { key: "k", sizeBytes: 1 }; },
        async get() { return new Uint8Array(); },
        async del() {},
        async getSignedUrl() { return "u"; },
      },
      docStore,
      async () => {}
    );
    await expect(service2.generate("doc-1")).rejects.toThrow(/ya fue generado/i);
    void service;
  });

  it("marca fallido y emite DOCUMENT_GENERATION_FAILED", async () => {
    const { service, events } = makeHarness();
    const doc = await service.failGeneration("doc-1", "motor caído");
    expect(doc).toBeTruthy();
    expect(events.some((e) => e.type === "DOCUMENT_GENERATION_FAILED")).toBe(true);
  });

  it("reclama una URL firmada y emite DOCUMENT_DOWNLOADED", async () => {
    const docStore: DocumentStoragePort = {
      async findByIdempotencyKey() {
        return null;
      },
      async markCompleted() {},
      async markFailed() {},
    };
    const { events } = makeHarness({ documentStore: docStore });
    // Documento ya completado.
    const repo: DocumentRepository = {
      async create() {
        return makeDocument();
      },
      async findById() {
        return makeDocument({
          estadoGeneracion: Estado.COMPLETED,
          storageKey: "contracts/c1/documents/s1/v1/x.pdf",
        });
      },
      async findBySnapshot() {
        return null;
      },
      async findByContract() {
        return [];
      },
    };
    const service2 = new DocumentService(
      repo,
      { async findById() { return makeSnapshot(); } },
      { async generate() { throw new Error("nope"); } },
      { async put() { return { key: "k", sizeBytes: 1 }; }, async get() { return new Uint8Array(); }, async del() {}, async getSignedUrl() { return "signed-url"; } },
      docStore,
      async (e) => { events.push(e as DocumentDomainEvent); }
    );
    const url = await service2.getDownloadUrl("doc-1");
    expect(url).toContain("signed");
    expect(events.some((e) => e.type === "DOCUMENT_DOWNLOADED")).toBe(true);
  });

  it("inmutabilidad: hash del snapshot original no cambia al alterar datos maestros", async () => {
    const snap1 = makeSnapshot();
    const crypto = createHash;

    // Generador que deriva el hash del contenido del snapshot (reproducibilidad).
    const snapshotHashGenerator: DocumentGenerator = {
      async generate({ snapshot }) {
        const json = JSON.stringify({
          cliente: snapshot.datosCliente,
          departamento: snapshot.datosDepartamento,
          contrato: snapshot.datosContrato,
          clausulas: snapshot.clausulas,
          anexos: snapshot.anexos,
        });
        const bytes = new Uint8Array(Buffer.from(`PDF::${json}`));
        return {
          bytes,
          mimeType: "application/pdf",
          filename: "CTR-0001.pdf",
          sha256: crypto("sha256").update(bytes).digest("hex"),
        };
      },
    };

    const { service, events } = makeHarness({
      snapshot: snap1,
      generator: snapshotHashGenerator,
    });
    const h1 = await service.generate("doc-1");
    void h1; // snapshot original conserva su hash

    // Cambian datos maestros -> el snapshot sería distinto (nuevo id).
    const snap2 = makeSnapshot({
      id: "snap-2",
      datosCliente: { nombres: "Otro", apellidos: "Cliente", documento: "D2" },
    });
    void makeHarness({
      snapshot: snap2,
      generator: snapshotHashGenerator,
    });
    const doc2 = makeDocument({ id: "doc-2", snapshotId: "snap-2", idempotencyKey: "contract:contract-1:document:snap-2" });
    const repo2: DocumentRepository = {
      async create() { return doc2; },
      async findById() { return doc2; },
      async findBySnapshot() { return null; },
      async findByContract() { return []; },
    };
    const service3 = new DocumentService(
      repo2,
      { async findById() { return snap2; } },
      snapshotHashGenerator,
      { async put() { return { key: "k", sizeBytes: 1 }; }, async get() { return new Uint8Array(); }, async del() {}, async getSignedUrl() { return "u"; } },
      { async findByIdempotencyKey() { return null; }, async markCompleted() {}, async markFailed() {} },
      async (e) => { events.push(e as DocumentDomainEvent); }
    );

    const h2 = await service3.generate("doc-2");
    expect(h2.sha256).not.toBe(h1.sha256);
    expect(h1.sha256).toHaveLength(64);
  });
});