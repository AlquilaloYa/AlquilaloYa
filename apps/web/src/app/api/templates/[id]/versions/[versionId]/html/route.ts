import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; versionId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.TEMPLATE_READ);
    if (denied) return denied;

    const { templateRepository } = await buildContractServices();
    const version = await templateRepository.findVersionById(params.versionId);
    if (!version || version.templateId !== params.id) {
      return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
    }
    if (!version.contenido) {
      return NextResponse.json({ error: "Esta versión no contiene HTML" }, { status: 400 });
    }

    return new NextResponse(version.contenido, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''plantilla-v${version.version}.html`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}