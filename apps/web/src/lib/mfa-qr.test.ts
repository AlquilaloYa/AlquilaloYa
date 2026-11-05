import { describe, expect, it } from "vitest";
import { createTotpUri } from "./mfa-qr";

describe("createTotpUri", () => {
  it("uses the company name as issuer and the signed-in email as account", () => {
    const uri = createTotpUri("admin@example.com", "SECRET123");
    const parsed = new URL(uri);

    expect(parsed.protocol).toBe("otpauth:");
    expect(decodeURIComponent(parsed.pathname.slice(1))).toBe(
      "AlquilaYa ERP:admin@example.com",
    );
    expect(parsed.searchParams.get("issuer")).toBe("AlquilaYa ERP");
    expect(parsed.searchParams.get("secret")).toBe("SECRET123");
    expect(parsed.searchParams.get("algorithm")).toBe("SHA1");
    expect(parsed.searchParams.get("digits")).toBe("6");
    expect(parsed.searchParams.get("period")).toBe("30");
  });
});
