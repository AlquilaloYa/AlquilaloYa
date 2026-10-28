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

  it("uses the signed token in the URL and reports Supabase upload errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              upload_url: "https://storage.example/storage/v1/object/upload/sign/media/file.mp4",
              token: "signed-upload-token",
              content_type: "video/mp4",
              max_bytes: 6 * 1024 * 1024,
              public_url: "https://storage.example/media/file.mp4",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: "400",
            error: "InvalidMimeType",
            message: "mime type video/mp4 is not supported",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      contenidoWebApi.images.upload(1, new Blob(["video"], { type: "video/mp4" }), "video.mp4"),
    ).rejects.toMatchObject({
      message: "Supabase Storage: mime type video/mp4 is not supported (HTTP 400).",
      statusCode: 400,
    });

    const uploadCall = fetchMock.mock.calls[1];
    expect(String(uploadCall?.[0])).toContain("?token=signed-upload-token");
    const init = uploadCall?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(new Headers(init.headers).get("x-upsert")).toBe("false");
  });

  it("rejects files larger than the signed upload limit before sending the file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            upload_url: "https://storage.example/storage/v1/object/upload/sign/media/file.mp4",
            token: "signed-upload-token",
            content_type: "video/mp4",
            max_bytes: 3,
            public_url: "https://storage.example/media/file.mp4",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      contenidoWebApi.images.upload(1, new Blob(["video"], { type: "video/mp4" }), "video.mp4"),
    ).rejects.toMatchObject({
      message: "El archivo supera el límite de tamaño permitido por el bucket.",
      statusCode: 413,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
