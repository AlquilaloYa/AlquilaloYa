import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./sesion-segura", () => ({
  forzarCierreSesion: vi.fn(),
}));

import { apiFetch, TIEMPO_LIMITE_PETICION_MS } from "./api";
import { forzarCierreSesion } from "./sesion-segura";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("apiFetch", () => {
  it("reports a timeout without closing the user's session", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      )
    );

    const request = apiFetch("/api/departamentos");
    const result = expect(request).rejects.toThrow("30 s de espera");
    await vi.advanceTimersByTimeAsync(TIEMPO_LIMITE_PETICION_MS);

    await result;
    expect(forzarCierreSesion).not.toHaveBeenCalled();
  });
});
