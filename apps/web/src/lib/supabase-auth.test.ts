import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@contract/config/env", () => ({
  supabaseUrl: () => "https://auth.example.test",
  supabaseAnonKey: () => "test-anon-key",
}));

import {
  resolveSession,
  SupabaseAuthUnavailableError,
  verifyAccessToken,
} from "./supabase-auth";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function requestWithCookies(cookie: string): Request {
  return new Request("https://app.example.test/api/contracts", {
    headers: { cookie },
  });
}

describe("Supabase session availability", () => {
  it("does not classify a Supabase network failure as an invalid session", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetch);

    await expect(
      resolveSession(requestWithCookies("sb_at=access-token"))
    ).rejects.toBeInstanceOf(SupabaseAuthUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not classify a Supabase outage as an invalid session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );

    await expect(verifyAccessToken("access-token")).rejects.toBeInstanceOf(
      SupabaseAuthUnavailableError
    );
  });

  it("still rejects a session that Supabase confirms is invalid", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      resolveSession(requestWithCookies("sb_at=invalid-token"))
    ).resolves.toBeNull();
    await expect(verifyAccessToken("invalid-token")).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a verified session for 15 seconds only", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ email: "user@example.test", id: "user-123" }),
          { headers: { "Content-Type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetch);

    await expect(verifyAccessToken("cached-access-token")).resolves.toMatchObject({
      email: "user@example.test",
      id: "user-123",
    });
    await verifyAccessToken("cached-access-token");
    expect(fetch).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_015_001);
    await verifyAccessToken("cached-access-token");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
