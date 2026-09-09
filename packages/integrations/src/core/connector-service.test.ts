import { describe, expect, it } from "vitest";
import { ConnectorRegistry } from "./registry";
import { ConnectorService } from "./connector-service";
import type {
  ConnectorRepository,
  CredentialRepository,
  ConnectorLogRepository,
  DeduplicationStore,
  ConnectorTransport,
} from "./connector";
import type {
  ConnectorInstance,
  DispatchResult,
} from "./types";

// --- Fakes ---

function fakeConnectorRepo(): ConnectorRepository & { store: ConnectorInstance[] } {
  const store: ConnectorInstance[] = [];
  return {
    store,
    async findById(id) {
      return store.find((c) => c.id === id) ?? null;
    },
    async findByType(type) {
      return store.filter((c) => c.type === type);
    },
    async list() {
      return store;
    },
    async count() {
      return store.length;
    },
    async create(input) {
      const inst: ConnectorInstance = {
        id: `conn-${Date.now()}`,
        type: input.type,
        provider: input.provider,
        name: input.name,
        description: input.description ?? null,
        status: "ENABLED",
        enabled: true,
        config: input.config ?? {},
        credentialId: null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.push(inst);
      return inst;
    },
    async update(id, changes) {
      const inst = store.find((c) => c.id === id);
      if (!inst) throw new Error("not found");
      if (changes.name !== undefined) inst.name = changes.name;
      if (changes.config !== undefined) inst.config = changes.config;
      return inst;
    },
    async setEnabled(id, enabled) {
      const inst = store.find((c) => c.id === id);
      if (!inst) throw new Error("not found");
      inst.enabled = enabled;
      inst.status = enabled ? "ENABLED" : "DISABLED";
      return inst;
    },
    async delete(id) {
      const idx = store.findIndex((c) => c.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  };
}

function fakeCredRepo(): CredentialRepository {
  return {
    async create() {
      return { id: "cred-1", authType: "BEARER", createdAt: new Date().toISOString(), expiresAt: null };
    },
    async replace() {
      return { id: "cred-1", authType: "BEARER", createdAt: new Date().toISOString(), expiresAt: null };
    },
    async findByConnector() {
      return null;
    },
    async getDecrypted() {
      return null;
    },
    async delete() {},
  };
}

function fakeLogRepo(): ConnectorLogRepository & { logs: unknown[] } {
  const logs: unknown[] = [];
  return {
    logs,
    async record(input) {
      logs.push(input);
    },
  };
}

function fakeDedupe(): DeduplicationStore & { seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    async exists(key) {
      return seen.has(key);
    },
    async mark(key) {
      seen.add(key);
    },
  };
}

function fakeTransport(result: DispatchResult = { ok: true, statusCode: 200, providerMessage: "ok" }): ConnectorTransport {
  return {
    async dispatch() {
      return result;
    },
  };
}

// --- Tests ---

describe("ConnectorRegistry", () => {
  it("registra y obtiene un transport", () => {
    const reg = new ConnectorRegistry();
    const fake = fakeTransport();
    reg.register({ type: "REST", provider: "*", build: () => fake });
    const t = reg.get("REST", "any-provider");
    expect(t).toBe(fake);
  });

  it("devuelve null si no hay transport registrado", () => {
    const reg = new ConnectorRegistry();
    expect(reg.get("WHATSAPP", "twilio")).toBeNull();
  });
});

describe("ConnectorService", () => {
  it("create: crea instancia en el repo", async () => {
    const connectors = fakeConnectorRepo();
    const service = new ConnectorService(
      connectors,
      fakeCredRepo(),
      fakeLogRepo(),
      new ConnectorRegistry(),
      fakeDedupe()
    );
    const inst = await service.create({ type: "REST", provider: "github", name: "Test", config: {} });
    expect(inst.name).toBe("Test");
    expect(connectors.store).toHaveLength(1);
  });

  it("dispatch: envía y registra log", async () => {
    const connectors = fakeConnectorRepo();
    const logs = fakeLogRepo();
    const dedupe = fakeDedupe();
    const registry = new ConnectorRegistry();
    registry.register({ type: "REST", provider: "*", build: () => fakeTransport() });

    const service = new ConnectorService(connectors, fakeCredRepo(), logs, registry, dedupe);

    const inst = await service.create({ type: "REST", provider: "test", name: "T", config: {} });
    const result = await service.dispatch(inst.id, "SEND_DATA", { msg: "hello" }, "key-1");

    expect(result.ok).toBe(true);
    expect(logs.logs).toHaveLength(1);
    expect(dedupe.seen.has("key-1")).toBe(true);
  });

  it("dispatch: idempotente no reenvía", async () => {
    const connectors = fakeConnectorRepo();
    const logs = fakeLogRepo();
    const dedupe = fakeDedupe();
    const registry = new ConnectorRegistry();
    registry.register({ type: "REST", provider: "*", build: () => fakeTransport() });

    const service = new ConnectorService(connectors, fakeCredRepo(), logs, registry, dedupe);

    const inst = await service.create({ type: "REST", provider: "test", name: "T", config: {} });
    await service.dispatch(inst.id, "SEND", {}, "key-1");
    const result2 = await service.dispatch(inst.id, "SEND", {}, "key-1");

    expect(result2.ok).toBe(true);
    expect(result2.providerMessage).toContain("idempotente");
    expect(logs.logs).toHaveLength(1); // solo 1 log, no 2
  });

  it("dispatch: falla si conector deshabilitado", async () => {
    const connectors = fakeConnectorRepo();
    const logs = fakeLogRepo();
    const registry = new ConnectorRegistry();
    const service = new ConnectorService(connectors, fakeCredRepo(), logs, registry, fakeDedupe());

    const inst = await service.create({ type: "REST", provider: "test", name: "T", config: {} });
    await service.setEnabled(inst.id, false);
    const result = await service.dispatch(inst.id, "SEND", {}, "key-2");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no disponible");
  });

  it("delete: elimina credenciales y conector", async () => {
    const connectors = fakeConnectorRepo();
    const service = new ConnectorService(
      connectors,
      fakeCredRepo(),
      fakeLogRepo(),
      new ConnectorRegistry(),
      fakeDedupe()
    );

    const inst = await service.create({ type: "REST", provider: "test", name: "T", config: {} });
    await service.delete(inst.id);
    expect(connectors.store).toHaveLength(0);
  });
});
