import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { downloadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; versionId: string } };

/** GET /api/templates/:id/versions/:versionId/pdf → descarga el PDF de la versión. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.TEMPLATE_READ);
    if (denied) return denied;

    const { templateRepository } = await buildContractServices();
    const version = await templateRepository.findVersionById(params.versionId);
    if (!version) {
      return NextResponse.json(
        { error: "Versión no encontrada" },
        { status: 404 }
      );
    }
    if (!version.pdfStorageKey) {
      return NextResponse.json(
        { error: "Esta versión no tiene un PDF adjunto" },
        { status: 400 }
      );
    }

    const bytes = await downloadObject(version.pdfStorageKey);
    const filename = version.pdfFilename ?? `plantilla-v${version.version}.pdf`;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}