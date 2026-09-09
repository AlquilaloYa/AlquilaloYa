import { afterEach, describe, expect, it } from "vitest";
import { metrics, routeBucket } from "./metrics";

afterEach(() => metrics.reset());

describe("routeBucket", () => {
  it("agrupa rutas api bajo api/<recurso>", () => {
    expect(routeBucket("/api/contracts/123")).toBe("api/contracts");
    expect(routeBucket("/api/health")).toBe("api/health");
    expect(routeBucket("/dashboard")).toBe("dashboard");
    expect(routeBucket("/")).toBe("root");
  });
});

describe("metrics", () => {
  it("cuenta peticiones por estado y ruta", () => {
    metrics.recordRequest("/api/contracts", 200);
    metrics.recordRequest("/api/contracts/1", 201);
    metrics.recordRequest("/api/payments", 500);
    const s = metrics.snapshot();
    expect(s.requestsTotal).toBe(3);
    expect(s.byRoute["api/contracts"]).toBe(2);
    expect(s.byRoute["api/payments"]).toBe(1);
    expect(s.requestsByStatus["2xx"]).toBe(2);
    expect(s.requestsByStatus["5xx"]).toBe(1);
    expect(s.errors).toBe(1);
  });

  it("registra bloqueos por rate limit", () => {
    metrics.recordRateLimited();
    metrics.recordRateLimited();
    expect(metrics.snapshot().rateLimited).toBe(2);
  });
});
