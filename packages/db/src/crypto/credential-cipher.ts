import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ConnectorCredentialsInput } from "@contract/domain/integration";

/**
 * Cifrado de credenciales de conectores y tokens de Google (AES-256-GCM).
 *
 * Reglas de seguridad (SEC-041/SEC-076):
 * - Falla-cerrado: si CONNECTOR_ENCRYPTION_KEY no está configurada (o es
 *   demasiado corta), el cifrado y el descifrado lanzan. NUNCA se usa una clave
 *   por defecto ni predecible.
 * - Formato versionado: "v1:<keyId>:<iv>:<tag>:<ciphertext>" (base64). El
 *   `keyId` identifica la clave con la que se cifró, lo que permite rotarla.
 * - Rotación: la clave anterior se expone en CONNECTOR_ENCRYPTION_KEY_PREVIOUS
 *   para poder descifrar datos cifrados con la clave previa durante la ventana
 *   de rotación. Al re-cifrar (script rotate-credentials), pasan a la nueva.
 * - Compatibilidad: se acepta el formato legado "<iv>:<tag>:<ciphertext>"
 *   probando la clave actual y la previa.
 *
 * El algoritmo: IV de 12 bytes aleatorio por cifrado, auth tag GCM verificada
 * al descifrar (detecta manipulación).
 */
const ALGO = "aes-256-gcm";
const FORMAT = "v1";
const MIN_KEY_LENGTH = 24;

function deriveKey(secret: string): Buffer {
  // 32 bytes para AES-256. Se usa sha256 como KDF de compatibilidad; el secreto
  // debe ser aleatorio y de alta entropía (>= 24 bytes) y custodiarse en un
  // gestor de secretos.
  return createHash("sha256").update(secret, "utf8").digest();
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

interface KeyEntry {
  id: string;
  key: Buffer;
}

function readKey(name: string, required: boolean): KeyEntry | null {
  const raw = process.env[name]?.trim();
  if (!raw || raw.length < MIN_KEY_LENGTH) {
    if (required) {
      throw new Error(
        `${name} no configurada o demasiado corta (mínimo ${MIN_KEY_LENGTH} caracteres). ` +
          "El cifrado de credenciales requiere una clave explícita."
      );
    }
    return null;
  }
  const key = deriveKey(raw);
  return { id: keyId(key), key };
}

function configuredKeys(): { current: KeyEntry; previous: KeyEntry[] } {
  const current = readKey("CONNECTOR_ENCRYPTION_KEY", true)!;
  const previous: KeyEntry[] = [];
  const prev = readKey("CONNECTOR_ENCRYPTION_KEY_PREVIOUS", false);
  if (prev) previous.push(prev);
  return { current, previous };
}

/** Indica si hay una clave de cifrado válida configurada. */
export function isEncryptionConfigured(): boolean {
  try {
    readKey("CONNECTOR_ENCRYPTION_KEY", true);
    return true;
  } catch {
    return false;
  }
}

/** Identificador de la clave de cifrado actual (para diagnostico/rotacion). */
export function currentKeyId(): string {
  return configuredKeys().current.id;
}

/** True si el dato ya esta cifrado con la clave actual (no requiere rotar). */
export function isEncryptedWithCurrentKey(data: string): boolean {
  const parts = data.split(":");
  if (parts.length !== 5 || parts[0] !== FORMAT) return false;
  return parts[1] === configuredKeys().current.id;
}

export function encryptJson(payload: object): string {
  const { current } = configuredKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, current.key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT,
    current.id,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function tryDecrypt<T>(key: Buffer, ivB64: string, tagB64: string, cipherB64: string): T {
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  if (iv.length !== 12) throw new Error("IV inválido");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function decryptJson<T = Record<string, unknown>>(data: string): T {
  const parts = data.split(":");
  let keyIdStr: string | null = null;
  let ivB64: string;
  let tagB64: string;
  let cipherB64: string;

  if (parts.length === 5 && parts[0] === FORMAT) {
    keyIdStr = parts[1]!;
    ivB64 = parts[2]!;
    tagB64 = parts[3]!;
    cipherB64 = parts[4]!;
  } else if (parts.length === 3) {
    // Formato legado sin versión ni keyId.
    ivB64 = parts[0]!;
    tagB64 = parts[1]!;
    cipherB64 = parts[2]!;
  } else {
    throw new Error("Credencial cifrada malformada");
  }

  const { current, previous } = configuredKeys();

  const candidates: KeyEntry[] = [];
  if (keyIdStr) {
    const match = [current, ...previous].find((k) => k.id === keyIdStr);
    if (!match) {
      throw new Error("No hay una clave configurada para descifrar esta credencial");
    }
    candidates.push(match);
  } else {
    candidates.push(current, ...previous);
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return tryDecrypt<T>(candidate.key, ivB64, tagB64, cipherB64);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No se pudo descifrar la credencial: ${(lastError as Error)?.message ?? "clave o datos inválidos"}`
  );
}

export function fingerprint(payload: object): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export type { ConnectorCredentialsInput };
