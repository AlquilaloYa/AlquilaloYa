import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { proxyAlquilaya } from "@/lib/alquilaya-web";

export const dynamic = "force-dynamic";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Proxy autenticado hacia /api/admin/v1 de AlquilaYa.
 * El ERP valida la sesión de Supabase + RBAC (web_content.*) y reenvía
 * al sitio. El navegador nunca conoce la credencial del sitio.
 *
 * Ejemplo: GET /api/contenido-web/properties → GET <ALQUILAYA_API_URL>/api/admin/v1/properties
 */
async function handler(req: Request, { params }: { params: { path: string[] } }) {
  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;

  const permission = WRITE_METHODS.has(req.method)
    ? Permission.WEB_CONTENT_UPDATE
    : Permission.WEB_CONTENT_READ;
  const denied = requirePermission(auth.user.role, permission);
  if (denied) return denied;

  const path = Array.isArray(params.path) ? params.path : [params.path];
  try {
    return await proxyAlquilaya(req, path);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error en el proxy de contenido web" },
      { status: 502 }
    );
  }
}

export async function GET(req: Request, ctx: { params: { path: string[] } }) {
  return handler(req, ctx);
}
export async function POST(req: Request, ctx: { params: { path: string[] } }) {
  return handler(req, ctx);
}
export async function PATCH(req: Request, ctx: { params: { path: string[] } }) {
  return handler(req, ctx);
}
export async function PUT(req: Request, ctx: { params: { path: string[] } }) {
  return handler(req, ctx);
}
export async function DELETE(req: Request, ctx: { params: { path: string[] } }) {
  return handler(req, ctx);
}