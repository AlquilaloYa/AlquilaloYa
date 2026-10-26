import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT = "v1";

function encryptionKey(): Buffer {
  const secret = process.env.CLIENT_CHAT_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "CLIENT_CHAT_ENCRYPTION_KEY debe tener al menos 32 caracteres",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptClientChatMessage(content: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(content, "utf8"),
    cipher.final(),
  ]);
  return [
    FORMAT,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptClientChatMessage(value: string): string {
  const [format, ivValue, tagValue, encryptedValue, ...extra] = value.split(":");
  if (
    format !== FORMAT ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra.length
  ) {
    throw new Error("Mensaje cifrado malformado");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
