import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("removeAllAuthUserTotpFactors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_URL", "https://auth.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("parses the Admin API's raw factor array and deletes only TOTP factors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "totp-factor", factor_type: "totp" },
            { id: "phone-factor", factor_type: "phone" },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "totp-factor" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { removeAllAuthUserTotpFactors } = await import("./users-admin");

    await expect(removeAllAuthUserTotpFactors("user-id")).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://auth.example/auth/v1/admin/users/user-id/factors/totp-factor",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("accepts an empty factor array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    const { removeAllAuthUserTotpFactors } = await import("./users-admin");

    await expect(removeAllAuthUserTotpFactors("user-id")).resolves.toBe(0);
  });
});
