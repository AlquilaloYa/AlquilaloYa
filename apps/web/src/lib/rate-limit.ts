import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting de ventana fija (Fase 7), puro y testeable.
 *
 * Usa Redis REST cuando está configurado y conserva un fallback local para
 * desarrollo o cuando el servicio Redis no está disponible.
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta el reinicio de la ventana. */
  resetIn: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  /** Evalúa una clave (p. ej. IP + ruta) en el instante `now`. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const entry = this.hits.get(key);

    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return {
        success: true,
        limit: this.limit,
        remaining: this.limit - 1,
        resetIn: Math.ceil(this.windowMs / 1000),
      };
    }

    entry.count += 1;
    const success = entry.count <= this.limit;
    return {
      success,
      limit: this.limit,
      remaining: Math.max(this.limit - entry.count, 0),
      resetIn: Math.max(Math.ceil((entry.resetAt - now) / 1000), 0),
    };
  }

  /** Libera entradas vencidas para evitar crecimiento sin límite. */
  sweep(now: number = Date.now()): void {
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

/**
 * Instancia global del limitador de API (edge-safe: solo usa Map).
 * Reutilizada entre invocaciones del middleware dentro del mismo isolate.
 */
const GLOBAL_KEY = "__contract_rate_limiter__";
const DISTRIBUTED_KEY = "__contract_distributed_rate_limiter__";

type GlobalWithLimiter = typeof globalThis & {
  [GLOBAL_KEY]?: RateLimiter;
  [DISTRIBUTED_KEY]?: Ratelimit;
};

export function getApiRateLimiter(): RateLimiter {
  const g = globalThis as GlobalWithLimiter;
  g[GLOBAL_KEY] ??= new RateLimiter(300, 60_000); // 300 req / min por IP
  return g[GLOBAL_KEY];
}

function getDistributedRateLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const g = globalThis as GlobalWithLimiter;
  g[DISTRIBUTED_KEY] ??= new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(300, "60 s"),
    prefix: "contract:rate-limit",
  });
  return g[DISTRIBUTED_KEY];
}

export async function checkApiRateLimit(key: string): Promise<RateLimitResult> {
  const distributed = getDistributedRateLimiter();
  if (distributed) {
    try {
      const result = await distributed.limit(key);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        resetIn: Math.max(Math.ceil((result.reset - Date.now()) / 1000), 1),
      };
    } catch {
      // Redis no disponible: el límite local mantiene una protección básica.
    }
  }

  const local = getApiRateLimiter();
  const result = local.check(key);
  if (local.size % 100 === 0) local.sweep();
  return result;
}

/** Extrae la IP del cliente desde las cabeceras proxy. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "local";
}
