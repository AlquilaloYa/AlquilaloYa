import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/lib/security-headers";
import { checkApiRateLimit, clientIp } from "@/lib/rate-limit";
import { metrics, routeBucket } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

/** Rutas accesibles sin sesión (landing + login). */
const PUBLIC_PATHS = new Set(["/", "/login"]);

function withSecurityHeaders(
  res: NextResponse,
  requestId: string
): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders())) res.headers.set(k, v);
  res.headers.set("X-Request-Id", requestId);
  return res;
}

/**
 * Middleware (edge) - Fase 7 + 8: seguridad + observabilidad + guard de sesión.
 * - Cabeceras de seguridad en todas las respuestas.
 * - Rate limiting por IP en /api/* (excluye health/metrics).
 * - Redirige a /login las páginas protegidas sin cookie de sesión (UX; la
 *   autorización real la aplica requireUser en cada ruta de API).
 * - Request id correlacionado en logs y cabecera X-Request-Id.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, path: pathname });

  // Rate limiting solo para API de negocio.
  const isApi = pathname.startsWith("/api");
  const skipLimit = pathname.startsWith("/api/health") || pathname.startsWith("/api/metrics");
  if (isApi && !skipLimit) {
    const ip = clientIp(req.headers);
    const rl = await checkApiRateLimit(`${ip}:${routeBucket(pathname)}`);
    if (!rl.success) {
      metrics.recordRateLimited();
      log.warn("rate_limited", { ip, remaining: rl.remaining });
      const res = NextResponse.json(
        { error: "Demasiadas peticiones, inténtalo más tarde" },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(rl.resetIn));
      res.headers.set("X-RateLimit-Limit", String(rl.limit));
      res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      return withSecurityHeaders(res, requestId);
    }
  }

  // Guard de páginas: sin sesión, mandamos al login (solo UX; no es la frontera
  // de seguridad, que son las rutas de API con requireUser).
  if (!isApi && !PUBLIC_PATHS.has(pathname)) {
    if (!req.cookies.get(ACCESS_COOKIE)?.value) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      return withSecurityHeaders(NextResponse.redirect(loginUrl), requestId);
    }
  }

  metrics.recordRequest(pathname, 200);
  log.debug("request", { ip: clientIp(req.headers) });

  return withSecurityHeaders(NextResponse.next(), requestId);
}

export const config = {
  // Ignora assets estáticos y el favicon; aplica al resto (incluidas rutas API).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
