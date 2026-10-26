import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createSignedObjectUrlIfPresent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null and logs when Storage reports a missing object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: "404",
            error: "not_found",
            message: "Object not found",
            code: "NoSuchKey",
          }),
          { status: 400 },
        ),
      ),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createSignedObjectUrlIfPresent } = await import("./storage");

    await expect(
      createSignedObjectUrlIfPresent("client/file.jpg", "client-work-order-evidence"),
    ).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith("Adjunto sin objeto correspondiente en Storage", {
      bucket: "client-work-order-evidence",
      key: "client/file.jpg",
    });
  });

  it("still throws for unrelated Storage failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Storage unavailable", { status: 503 }),
      ),
    );
    const { createSignedObjectUrlIfPresent } = await import("./storage");

    await expect(
      createSignedObjectUrlIfPresent("client/file.jpg", "client-work-order-evidence"),
    ).rejects.toThrow("Storage signed URL falló (503)");
  });
});
