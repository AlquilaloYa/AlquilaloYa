import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentKeyId,
  decryptJson,
  encryptJson,
  isEncryptedWithCurrentKey,
  isEncryptionConfigured,
} from "./credential-cipher";

const KEY_A = "clave-de-prueba-A-0123456789012345678901234567890";
const KEY_B = "clave-de-prueba-B-0123456789012345678901234567890";

function legacyEncrypt(payload: object, secret: string): string {
  const key = createHash("sha256").update(secret, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credential-cipher (SEC-041 / SEC-076)", () => {
  it("cifra y descifra con la clave configurada (round-trip)", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    const payload = { accessToken: "abc", refreshToken: "xyz", nested: { n: 1 } };
    const encrypted = encryptJson(payload);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptJson(encrypted)).toEqual(payload);
  });

  it("falla-cerrado sin clave: nunca usa una clave por defecto predecible", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", "");
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptJson({ a: 1 })).toThrow();
    expect(() => decryptJson("dato:malformado")).toThrow();
  });

  it("rechaza claves demasiado cortas", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", "corta");
    expect(() => encryptJson({ a: 1 })).toThrow(/24/);
  });

  it("detecta manipulación del criptograma (auth tag GCM)", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    const parts = encryptJson({ a: 1 }).split(":");
    const ciphertext = Buffer.from(parts[4]!, "base64");
    ciphertext[0] = (ciphertext[0]! ^ 0xff) & 0xff;
    parts[4] = ciphertext.toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  it("rota claves usando CONNECTOR_ENCRYPTION_KEY_PREVIOUS", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    const encryptedWithA = encryptJson({ token: "t" });
    expect(isEncryptedWithCurrentKey(encryptedWithA)).toBe(true);

    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_B);
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY_PREVIOUS", KEY_A);
    expect(isEncryptedWithCurrentKey(encryptedWithA)).toBe(false);
    expect(decryptJson(encryptedWithA)).toEqual({ token: "t" });

    const encryptedWithB = encryptJson({ token: "t" });
    expect(isEncryptedWithCurrentKey(encryptedWithB)).toBe(true);
    expect(currentKeyId()).not.toBe("");

    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY_PREVIOUS", "");
    expect(decryptJson(encryptedWithB)).toEqual({ token: "t" });
  });

  it("rechaza una credencial cifrada con una clave desconocida", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    const encrypted = encryptJson({ a: 1 });
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_B);
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY_PREVIOUS", "");
    expect(() => decryptJson(encrypted)).toThrow(/No hay una clave/);
  });

  it("descifra el formato legado (sin version) con la clave actual", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    const legacy = legacyEncrypt({ v: "token-legado" }, KEY_A);
    expect(legacy.split(":")).toHaveLength(3);
    expect(decryptJson(legacy)).toEqual({ v: "token-legado" });
  });

  it("descifra el formato legado con la clave previa durante la rotación", () => {
    const legacy = legacyEncrypt({ v: "token-legado" }, KEY_A);
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_B);
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY_PREVIOUS", KEY_A);
    expect(decryptJson(legacy)).toEqual({ v: "token-legado" });
  });

  it("rechaza una credencial malformada", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", KEY_A);
    expect(() => decryptJson("solo-una-parte")).toThrow(/malformada/);
  });
});
