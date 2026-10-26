import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptClientChatMessage,
  encryptClientChatMessage,
} from "./client-chat-cipher";

const TEST_KEY = "portal-chat-test-key-longer-than-32-characters";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("client chat encryption", () => {
  it("encrypts and decrypts messages", () => {
    vi.stubEnv("CLIENT_CHAT_ENCRYPTION_KEY", TEST_KEY);
    const encrypted = encryptClientChatMessage("La visita ya llegó");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptClientChatMessage(encrypted)).toBe("La visita ya llegó");
  });

  it("rejects tampered or malformed messages", () => {
    vi.stubEnv("CLIENT_CHAT_ENCRYPTION_KEY", TEST_KEY);
    const parts = encryptClientChatMessage("Mensaje privado").split(":");
    parts[2] = Buffer.alloc(16).toString("base64");
    expect(() => decryptClientChatMessage(parts.join(":"))).toThrow();
    expect(() => decryptClientChatMessage("malformed")).toThrow(
      "Mensaje cifrado malformado",
    );
  });

  it("fails closed when the encryption key is missing", () => {
    vi.stubEnv("CLIENT_CHAT_ENCRYPTION_KEY", "");
    expect(() => encryptClientChatMessage("Mensaje")).toThrow(
      "CLIENT_CHAT_ENCRYPTION_KEY debe tener al menos 32 caracteres",
    );
  });
});
