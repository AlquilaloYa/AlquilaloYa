import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ConnectorCredentialsInput } from "@contract/domain/integration";

/**
 * Cifrado de credenciales de conectores (AES-256-GCM) con la clave de la app.
 * - Nunca se guardan tokens en texto plano.
 * - Cada valor cifrado lleva su propio IV y auth tag (formato iv:authtag:ciphertext).
 */
const ALGO = "aes-256-gcm";

function keyFromEnv(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  return createHash("sha256").update(raw ?? "default").digest();
}

export function encryptJson(payload: object): string {
  const key = keyFromEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptJson<T = Record<string, unknown>>(data: string): T {
  const [ivB64, tagB64, cipherB64] = data.split(":");
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error("Credencial malformada");
  }
  const key = keyFromEnv();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function fingerprint(payload: object): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export type { ConnectorCredentialsInput };