import { describe, it, expect } from "vitest";
import {
  assertProductionSecrets,
  collectProductionSecretProblems,
  type EnvLike,
} from "./production-secrets";

const PROD: EnvLike = {
  NODE_ENV: "production",
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop",
  CONNECTOR_ENCRYPTION_KEY:
    "7f3a9c1e5b2d8f4a6c0e9b7d3a1f5c8e2b4d6a8f0c2e4b6d8a0f2c4e6b8d0a2f",
  CLIENT_CHAT_ENCRYPTION_KEY:
    "portal-chat-production-key-7f3a9c1e5b2d8f4a6c0e9b7d3a1f5c8e",
  DATABASE_URL: "postgresql://user:pass@db.prod.supabase.co:5432/postgres",
};

describe("collectProductionSecretProblems", () => {
  it("no reporta problemas con una configuración de producción válida", () => {
    expect(collectProductionSecretProblems(PROD)).toEqual([]);
  });

  it("reporta los secretos faltantes", () => {
    const problems = collectProductionSecretProblems({});
    expect(problems.some((p) => p.includes("SUPABASE_URL"))).toBe(true);
    expect(problems.some((p) => p.includes("SUPABASE_ANON_KEY"))).toBe(true);
    expect(problems.some((p) => p.includes("CONNECTOR_ENCRYPTION_KEY"))).toBe(true);
    expect(problems.some((p) => p.includes("CLIENT_CHAT_ENCRYPTION_KEY"))).toBe(true);
  });

  it("detecta valores de plantilla/dummy (p. ej. los de CI)", () => {
    const problems = collectProductionSecretProblems({
      ...PROD,
      CONNECTOR_ENCRYPTION_KEY: "ci-connector-encryption-key-0000000000",
    });
    expect(problems.some((p) => p.includes("CONNECTOR_ENCRYPTION_KEY"))).toBe(true);
  });

  it("detecta valores con caracteres repetidos (no aleatorios)", () => {
    const problems = collectProductionSecretProblems({
      ...PROD,
      CONNECTOR_ENCRYPTION_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(problems.some((p) => p.includes("CONNECTOR_ENCRYPTION_KEY"))).toBe(true);
  });

  it("exige una clave de chat suficientemente larga y no placeholder", () => {
    expect(
      collectProductionSecretProblems({
        ...PROD,
        CLIENT_CHAT_ENCRYPTION_KEY: "short",
      }).some((p) => p.includes("CLIENT_CHAT_ENCRYPTION_KEY"))
    ).toBe(true);
    expect(
      collectProductionSecretProblems({
        ...PROD,
        CLIENT_CHAT_ENCRYPTION_KEY: "placeholder-chat-key-12345678901234567890",
      }).some((p) => p.includes("CLIENT_CHAT_ENCRYPTION_KEY"))
    ).toBe(true);
  });

  it("rechaza recursos locales (localhost)", () => {
    const problems = collectProductionSecretProblems({
      ...PROD,
      SUPABASE_URL: "http://localhost:54321",
      DATABASE_URL: "postgresql://ci:x@127.0.0.1:5432/ci",
    });
    expect(problems.some((p) => p.includes("SUPABASE_URL"))).toBe(true);
    expect(problems.some((p) => p.includes("DATABASE_URL"))).toBe(true);
  });

  it("rechaza que la clave previa siga configurada tras rotar", () => {
    const problems = collectProductionSecretProblems({
      ...PROD,
      CONNECTOR_ENCRYPTION_KEY_PREVIOUS:
        "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    });
    expect(problems.some((p) => p.includes("CONNECTOR_ENCRYPTION_KEY_PREVIOUS"))).toBe(true);
  });
});

describe("assertProductionSecrets", () => {
  it("no falla fuera de producción aunque falten secretos", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionSecrets({ NODE_ENV: "test" })).not.toThrow();
  });

  it("no falla durante la fase de build de Next", () => {
    expect(() =>
      assertProductionSecrets({ ...PROD, NEXT_PHASE: "phase-production-build" })
    ).not.toThrow();
  });

  it("falla en producción si hay secretos mal configurados", () => {
    expect(() =>
      assertProductionSecrets({ ...PROD, SUPABASE_ANON_KEY: undefined })
    ).toThrow(/SEC-001/);
  });

  it("pasa con una configuración de producción válida", () => {
    expect(() => assertProductionSecrets(PROD)).not.toThrow();
  });
});
