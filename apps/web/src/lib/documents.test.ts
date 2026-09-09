import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";
import { buildDocumentStorageKey } from "./documents";

describe("sha256Hex", () => {
  it("calcula la huella sha256 conocida", () => {
    expect(sha256Hex(new TextEncoder().encode("hello"))).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("cambia si el contenido cambia en un byte (integridad)", () => {
    const a = sha256Hex(new TextEncoder().encode("contrato v1"));
    const b = sha256Hex(new TextEncoder().encode("contrato v2"));
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("buildDocumentStorageKey", () => {
  it("compone la ruta contrato/tipo/filename", () => {
    expect(
      buildDocumentStorageKey("abc-123", "CONTRATO_PDF", "ANG156-L1.pdf")
    ).toBe("abc-123/CONTRATO_PDF/ANG156-L1.pdf");
  });

  it("compone la ruta de una adenda", () => {
    expect(
      buildDocumentStorageKey("abc-123", "ADENDA", "ANG156-L1-ADD-1.pdf")
    ).toBe("abc-123/ADENDA/ANG156-L1-ADD-1.pdf");
  });
});
