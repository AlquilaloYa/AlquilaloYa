import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("enrollTotp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://auth.example");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enrolls a new factor when Supabase omits the empty factors list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "new-factor", totp: { secret: "SECRET123" } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { enrollTotp } = await import("./mfa");

    await expect(enrollTotp("access-token", "admin@example.com")).resolves.toMatchObject({
      factorId: "new-factor",
      secret: "SECRET123",
      qrCode: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://auth.example/auth/v1/factors");
  });
});
