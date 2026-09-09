import { describe, expect, it } from "vitest";
import { TemplateService, type TemplateRepository } from "./template-service";
import { ClauseService, type ClauseRepository } from "../clause/clause-service";
import { AnnexService, type AnnexRepository } from "../annex/annex-service";
import type { TemplateVersion, ContractTemplate } from "./template";
import type { Clause, ClauseVersion } from "../clause/clause";
import type { Annex, AnnexVersion } from "../annex/annex";

function makeTemplateRepo(): {
  repo: TemplateRepository;
  versions: TemplateVersion[];
  templates: ContractTemplate[];
} {
  const versions: TemplateVersion[] = [];
  const templates: ContractTemplate[] = [];
  let v = 0;
  return {
    versions,
    templates,
    repo: {
      async listActive() {
        return templates;
      },
      async createTemplate(input) {
        const t: ContractTemplate = { ...input, id: `t-${templates.length + 1}`, activo: true };
        templates.push(t);
        return t;
      },
      async findVersions(id) {
        return versions.filter((x) => x.templateId === id);
      },
      async findVersionById(id) {
        return versions.find((x) => x.id === id) ?? null;
      },
      async findLatestPublished() {
        const pub = versions.filter((x) => x.publicada);
        return pub.length ? (pub[pub.length - 1] ?? null) : null;
      },
      async createVersion(templateId, version, contenido, pdfStorageKey, pdfFilename) {
        v++;
        const vv: TemplateVersion = {
          id: `tv-${v}`,
          templateId,
          version,
          contenido: contenido ?? null,
          pdfStorageKey: pdfStorageKey ?? null,
          pdfFilename: pdfFilename ?? null,
          publicada: false,
          publicadoEn: null,
          createdAt: new Date().toISOString(),
        };
        versions.push(vv);
        return vv;
      },
      async publishVersion(id) {
        const idx = versions.findIndex((x) => x.id === id);
        if (idx === -1) {
          throw new Error("no encontrado");
        }
        const current = versions[idx];
        if (!current) {
          throw new Error("no encontrado");
        }
        versions[idx] = {
          ...current,
          publicada: true,
          publicadoEn: new Date().toISOString(),
        };
        const result = versions[idx];
        if (!result) {
          throw new Error("no encontrado");
        }
        return result;
      },
    },
  };
}

describe("TemplateService (versionado)", () => {
  it("crea versiones incrementales de la misma plantilla", async () => {
    const { repo } = makeTemplateRepo();
    const t = await repo.createTemplate({ clave: "PN_LARGO", nombre: "Largo PN" });
    const service = new TemplateService(repo);

    const v1 = await service.createVersion({ templateId: t.id, contenido: "v1" });
    const v2 = await service.createVersion({ templateId: t.id, contenido: "v2" });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });

  it("una versión publicada no vuelve a editarse", async () => {
    const { repo } = makeTemplateRepo();
    const t = await repo.createTemplate({ clave: "PN_CORTO", nombre: "Corto PN" });
    const service = new TemplateService(repo);
    const v1 = await service.createVersion({ templateId: t.id, contenido: "v1" });

    const published = await service.publishVersion(v1.id);
    expect(published.publicada).toBe(true);

    await expect(service.publishVersion(v1.id)).rejects.toThrow(/no puede editarse/);
  });
});

describe("ClauseService", () => {
  it("crea versión de cláusula", async () => {
    const versions: ClauseVersion[] = [];
    let v = 0;
    let clause: Clause | null = null;
    const repo: ClauseRepository = {
      async createClause(input) {
        clause = { ...input, id: "clause-1", createdAt: "", updatedAt: "" };
        return clause;
      },
      async findVersions() {
        return versions;
      },
      async findVersionById(id) {
        return versions.find((x) => x.id === id) ?? null;
      },
      async createVersion(clauseId, version, contenido) {
        v++;
        const vv: ClauseVersion = {
          id: `cv-${v}`,
          clauseId,
          version,
          contenido,
          publicada: "BORRADOR",
          createdAt: "",
        };
        versions.push(vv);
        return vv;
      },
      async publishVersion(id) {
        const idx = versions.findIndex((x) => x.id === id);
        if (idx === -1) {
          throw new Error("no encontrado");
        }
        const current = versions[idx];
        if (!current) {
          throw new Error("no encontrado");
        }
        versions[idx] = { ...current, publicada: "PUBLICADA" };
        const result = versions[idx];
        if (!result) {
          throw new Error("no encontrado");
        }
        return result;
      },
    };
    const service = new ClauseService(repo);

    const c = await service.createClause({ clave: "CLA-1", nombre: "Objeto" });
    const version = await service.createVersion(c.id, "contenido");

    expect(version.version).toBe(1);
    expect(version.contenido).toBe("contenido");
  });
});

describe("AnnexService", () => {
  it("resuelve anexos activos por departamento y congela versión", async () => {
    const annexes: Annex[] = [];
    const versions: AnnexVersion[] = [];
    let v = 0;
    const repo: AnnexRepository = {
      async createAnnex(input) {
        const a: Annex = { ...input, id: "annex-1", activo: true, createdAt: "", updatedAt: "" };
        annexes.push(a);
        return a;
      },
      async findActiveByDepartment(id) {
        return annexes.filter((a) => a.departamentoId === id && a.activo);
      },
      async findVersions() {
        return versions;
      },
      async findVersionById(id) {
        return versions.find((x) => x.id === id) ?? null;
      },
      async createVersion(annexId, version, contenido) {
        v++;
        const vv: AnnexVersion = {
          id: `av-${v}`,
          annexId,
          version,
          contenido,
          publicada: false,
          publicadoEn: null,
          createdAt: "",
        };
        versions.push(vv);
        return vv;
      },
      async publishVersion(id) {
        const idx = versions.findIndex((x) => x.id === id);
        if (idx === -1) {
          throw new Error("no encontrado");
        }
        const current = versions[idx];
        if (!current) {
          throw new Error("no encontrado");
        }
        versions[idx] = {
          ...current,
          publicada: true,
          publicadoEn: new Date().toISOString(),
        };
        const result = versions[idx];
        if (!result) {
          throw new Error("no encontrado");
        }
        return result;
      },
    };
    const service = new AnnexService(repo);

    const a = await service.createAnnex({
      departamentoId: "depto-1",
      nombre: "Acta de entrega",
      activo: true,
    });
    const actives = await service.activeForDepartment("depto-1");
    const version = await service.createVersion(a.id, "contenido anexo");

    expect(actives).toHaveLength(1);
    expect(version.version).toBe(1);
  });
});