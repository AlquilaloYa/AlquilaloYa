import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/lib/security-headers";
import { checkApiRateLimit, clientIp } from "@/lib/rate-limit";
import { metrics, routeBucket } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { ACCESS_COOKIE } from "@/lib/session-cookies";
const CLIENT_PORTAL_COOKIE_PREFIX =
  process.env.NODE_ENV === "production" ? "__Host-" : "";
const CLIENT_PORTAL_ACCESS_COOKIE = `${CLIENT_PORTAL_COOKIE_PREFIX}client_portal_at`;
const CLIENT_PORTAL_REFRESH_COOKIE = `${CLIENT_PORTAL_COOKIE_PREFIX}client_portal_rt`;

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

function withAndroidAppCors(res: NextResponse, req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const allowedOrigin =
    process.env.FIELDOPS_ANDROID_ORIGIN?.replace(/\/+$/, "") ||
    "https://localhost";
  if (req.nextUrl.pathname.startsWith("/api") && origin === allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-FieldOps-Client");
    res.headers.set("Vary", "Origin");
  }
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

  if (process.env.CLIENT_PORTAL_ONLY === "true") {
    const isPortalPage =
      pathname === "/portal-cliente" ||
      pathname.startsWith("/portal-cliente/");
    const isPortalApi = pathname.startsWith("/api/portal-cliente/");
    const isHealthcheck = pathname === "/api/health";

    if (pathname === "/") {
      return withAndroidAppCors(
        withSecurityHeaders(
          NextResponse.redirect(new URL("/portal-cliente/login", req.nextUrl.origin)),
          requestId,
        ),
        req,
      );
    }
    if (!isPortalPage && !isPortalApi && !isHealthcheck) {
      return withAndroidAppCors(
        withSecurityHeaders(new NextResponse(null, { status: 404 }), requestId),
        req,
      );
    }
  }

  // Rate limiting solo para API de negocio.
  const isApi = pathname.startsWith("/api");
  if (isApi && req.method === "OPTIONS") {
    const allowedOrigin =
      process.env.FIELDOPS_ANDROID_ORIGIN?.replace(/\/+$/, "") ||
      "https://localhost";
    if (req.headers.get("origin") !== allowedOrigin) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Origen de la app no permitido" }, { status: 403 }),
        requestId,
      );
    }
    return withAndroidAppCors(
      withSecurityHeaders(new NextResponse(null, { status: 204 }), requestId),
      req,
    );
  }
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
      return withAndroidAppCors(withSecurityHeaders(res, requestId), req);
    }
  }

  // Guard de páginas: sin sesión, mandamos al login (solo UX; no es la frontera
  // de seguridad, que son las rutas de API con requireUser).
  if (!isApi && !PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/portal-cliente/login") {
      return withAndroidAppCors(
        withSecurityHeaders(NextResponse.next(), requestId),
        req,
      );
    }
    if (pathname === "/portal-cliente" || pathname.startsWith("/portal-cliente/")) {
      if (
        !req.cookies.get(CLIENT_PORTAL_ACCESS_COOKIE)?.value &&
        !req.cookies.get(CLIENT_PORTAL_REFRESH_COOKIE)?.value
      ) {
        const loginUrl = new URL("/portal-cliente/login", req.nextUrl.origin);
        return withAndroidAppCors(
          withSecurityHeaders(NextResponse.redirect(loginUrl), requestId),
          req,
        );
      }
      return withAndroidAppCors(
        withSecurityHeaders(NextResponse.next(), requestId),
        req,
      );
    }
    if (!req.cookies.get(ACCESS_COOKIE)?.value) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      return withAndroidAppCors(
        withSecurityHeaders(NextResponse.redirect(loginUrl), requestId),
        req,
      );
    }
  }

  metrics.recordRequest(pathname, 200);
  log.debug("request", { ip: clientIp(req.headers) });

  return withAndroidAppCors(withSecurityHeaders(NextResponse.next(), requestId), req);
}

export const config = {
  // Ignora assets estáticos (archivos con extensión), el favicon y _next;
  // aplica al resto (incluidas rutas API). Sin esto, los archivos de /public
  // (logo, GIF de fondo, icono, imagenes de contratos) eran secuestrados por
  // el guard de sesion y devolvian HTML en vez de la imagen.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)",
  ],
};
