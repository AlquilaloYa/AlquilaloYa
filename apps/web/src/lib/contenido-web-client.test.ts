import { afterEach, describe, expect, it, vi } from "vitest";
import { contenidoWebApi } from "./contenido-web-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contenidoWebApi error handling", () => {
  it("extracts the nested message from the AlquilaYa API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "error",
            error: { code: 500, message: "column custom_tags does not exist" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(contenidoWebApi.properties.list()).rejects.toMatchObject({
      message: "column custom_tags does not exist",
      statusCode: 500,
    });
  });
});
