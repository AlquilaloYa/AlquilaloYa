import { describe, it, expect, vi, afterEach } from "vitest";
import { securityHeaders, STRICT_TRANSPORT_SECURITY } from "./security-headers";

/**
 * SEC-071: endurecimiento de cabeceras HTTP.
 * - HSTS solo en producción.
 * - CSP sin `object-src` permisivo.
 */
describe("securityHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("en producción incluye HSTS y CSP estricta", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = securityHeaders();
    expect(headers["Strict-Transport-Security"]).toBe(STRICT_TRANSPORT_SECURITY);
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("unsafe-eval");
    // La vista previa de PDF hace fetch() de blob:/data:; deben estar en connect-src.
    expect(headers["Content-Security-Policy"]).toContain(
      "connect-src 'self' https: blob: data:",
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("en desarrollo omite HSTS y CSP para no romper el HMR", () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = securityHeaders();
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
