/**
 * Contador de métricas en memoria global (Fase 7 - observabilidad).
 * Edge-safe: solo usa Map/Date. Expuesto por /api/metrics y usado por el
 * middleware para contar peticiones, errores y bloqueos por rate limit.
 */
export interface MetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requestsTotal: number;
  requestsByStatus: Record<string, number>;
  rateLimited: number;
  errors: number;
  byRoute: Record<string, number>;
}

interface MetricsState {
  startedAt: number;
  requestsTotal: number;
  requestsByStatus: Record<string, number>;
  rateLimited: number;
  errors: number;
  byRoute: Record<string, number>;
}

const GLOBAL_KEY = "__contract_metrics__";
type GlobalWithMetrics = typeof globalThis & { [GLOBAL_KEY]?: MetricsState };

function state(): MetricsState {
  const g = globalThis as GlobalWithMetrics;
  g[GLOBAL_KEY] ??= {
    startedAt: Date.now(),
    requestsTotal: 0,
    requestsByStatus: {},
    rateLimited: 0,
    errors: 0,
    byRoute: {},
  };
  return g[GLOBAL_KEY]!;
}

/** Ruta de alto nivel (primer segmento, o api/<recurso>) para agrupar. */
export function routeBucket(pathname: string): string {
  const segs = pathname.split("?")[0]?.split("/").filter(Boolean) ?? [];
  let seg = segs[0] ?? "root";
  if (seg === "api" && segs[1]) seg = `api/${segs[1]}`;
  return seg.slice(0, 40);
}

export const metrics = {
  recordRequest(pathname: string, status: number): void {
    const s = state();
    s.requestsTotal += 1;
    const cls = `${Math.floor(status / 100)}xx`;
    s.requestsByStatus[cls] = (s.requestsByStatus[cls] ?? 0) + 1;
    const route = routeBucket(pathname);
    s.byRoute[route] = (s.byRoute[route] ?? 0) + 1;
    if (status >= 500) s.errors += 1;
  },
  recordRateLimited(): void {
    state().rateLimited += 1;
  },
  snapshot(): MetricsSnapshot {
    const s = state();
    return {
      startedAt: new Date(s.startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - s.startedAt) / 1000),
      requestsTotal: s.requestsTotal,
      requestsByStatus: { ...s.requestsByStatus },
      rateLimited: s.rateLimited,
      errors: s.errors,
      byRoute: { ...s.byRoute },
    };
  },
  /** Solo para tests: reinicia los contadores. */
  reset(): void {
    const g = globalThis as GlobalWithMetrics;
    delete g[GLOBAL_KEY];
  },
};
