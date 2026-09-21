import { describe, expect, it } from "vitest";
import { GoogleFormsAdapter } from "../rest/google-forms-adapter";
import { GmailAdapter } from "../rest/gmail-adapter";
import { WhatsAppAdapter } from "../rest/whatsapp-adapter";

describe("GoogleFormsAdapter", () => {
  it("test_connection retorna ok", async () => {
    const adapter = new GoogleFormsAdapter();
    const result = await adapter.dispatch({ kind: "TEST_CONNECTION" });
    expect(result.ok).toBe(true);
  });

  it("dispatch sin webhookUrl falla", async () => {
    const adapter = new GoogleFormsAdapter();
    const result = await adapter.dispatch({
      kind: "SEND_DATA",
      connectorId: "c1",
      provider: "google-forms",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("webhookUrl");
  });
});

describe("GmailAdapter", () => {
  it("test_connection retorna ok", async () => {
    const adapter = new GmailAdapter();
    const result = await adapter.dispatch({ kind: "TEST_CONNECTION" });
    expect(result.ok).toBe(true);
  });

  it("dispatch sin campos requeridos falla", async () => {
    const adapter = new GmailAdapter({ accessToken: "token123" });
    const result = await adapter.dispatch({
      kind: "SEND_EMAIL",
      connectorId: "c1",
      provider: "gmail",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("faltan campos");
  });

  it("dispatch sin accessToken falla", async () => {
    const adapter = new GmailAdapter();
    const result = await adapter.dispatch({
      kind: "SEND_EMAIL",
      connectorId: "c1",
      provider: "gmail",
      payload: { to: "test@test.com", subject: "Hola", body: "Mensaje" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("accessToken");
  });
});

describe("WhatsAppAdapter", () => {
  it("test_connection sin credenciales avisa de los campos faltantes", async () => {
    const adapter = new WhatsAppAdapter();
    const result = await adapter.dispatch({ kind: "TEST_CONNECTION" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("accessToken");
  });

  it("test_connection con token pero sin phoneNumberId avisa", async () => {
    const adapter = new WhatsAppAdapter({ accessToken: "EAAG..." });
    const result = await adapter.dispatch({ kind: "TEST_CONNECTION", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("phoneNumberId");
  });

  it("dispatch sin to falla", async () => {
    const adapter = new WhatsAppAdapter({ phoneNumberId: "123" });
    const result = await adapter.dispatch({
      kind: "SEND_MESSAGE",
      connectorId: "c1",
      provider: "whatsapp",
      payload: { text: "Hola" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("to");
  });

  it("dispatch sin phoneNumberId falla", async () => {
    const adapter = new WhatsAppAdapter();
    const result = await adapter.dispatch({
      kind: "SEND_MESSAGE",
      connectorId: "c1",
      provider: "whatsapp",
      payload: { to: "+51999999999", text: "Hola" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("phoneNumberId");
  });
});
