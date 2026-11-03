import { describe, expect, it } from "vitest";
import {
  RateLimiter,
  clientIp,
  rateLimitPolicyForPath,
} from "./rate-limit";

describe("RateLimiter (ventana fija)", () => {
  it("permite hasta el límite y luego bloquea", () => {
    const rl = new RateLimiter(3, 60_000);
    const t0 = 1_000_000;
    expect(rl.check("ip", t0).success).toBe(true);
    expect(rl.check("ip", t0 + 1).success).toBe(true);
    expect(rl.check("ip", t0 + 2).success).toBe(true); // 3ra permitida
    const fourth = rl.check("ip", t0 + 3);
    expect(fourth.success).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("reinicio de ventana al pasar el TTL", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("k", 0).success).toBe(true);
    expect(rl.check("k", 500).success).toBe(false);
    expect(rl.check("k", 1500).success).toBe(true); // nueva ventana
  });

  it("sweep elimina entradas vencidas", () => {
    const rl = new RateLimiter(5, 1000);
    rl.check("a", 0);
    rl.check("b", 0);
    expect(rl.size).toBe(2);
    rl.sweep(2000);
    expect(rl.size).toBe(0);
  });

  it("claves distintas cuentan por separado", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("x", 0).success).toBe(true);
    expect(rl.check("y", 0).success).toBe(true);
    expect(rl.check("x", 10).success).toBe(false);
  });
});

describe("clientIp", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("fallback a x-real-ip y luego a local", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2"
    );
    expect(clientIp(new Headers())).toBe("local");
  });
});

describe("rateLimitPolicyForPath", () => {
  it("aplica un límite más estricto a inicios de sesión y verificación MFA", () => {
    expect(rateLimitPolicyForPath("/api/auth/login")).toEqual({
      id: "auth-login",
      limit: 10,
      windowMs: 15 * 60_000,
    });
    expect(rateLimitPolicyForPath("/api/auth/mfa/verify").id).toBe("auth-mfa");
    expect(rateLimitPolicyForPath("/api/portal-cliente/auth/login").id).toBe(
      "auth-login",
    );
  });

  it("limita por separado la generación de PDF y conserva el límite general", () => {
    expect(rateLimitPolicyForPath("/api/documents/pdf").limit).toBe(20);
    expect(rateLimitPolicyForPath("/api/payments").limit).toBe(300);
  });
});
