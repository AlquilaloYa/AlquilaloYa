import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { uploadObject, isStorageConfigured } from "@/lib/storage";
import { sha256Hex } from "@/lib/hash";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function GET(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.TEMPLATE_READ);
    if (denied) return denied;

    const { templateRepository } = await buildContractServices();
    const versions = await templateRepository.findVersions(params.id);
    return NextResponse.json(versions);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** POST /api/templates/:id/versions  (FormData con `archivo` PDF) → crea versión nueva. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.TEMPLATE_MANAGE);
    if (denied) return denied;

    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: "Storage no configurado: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) {
      return NextResponse.json(
        { error: "Se requiere un archivo PDF (campo 'archivo')" },
        { status: 400 }
      );
    }

    const isPdf =
      archivo.type === "application/pdf" ||
      archivo.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "El archivo debe ser un PDF" },
        { status: 400 }
      );
    }
    if (archivo.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: "El PDF supera el tamaño máximo de 25 MB" },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const digest = sha256Hex(bytes);
    const storageKey = `templates/${params.id}/pdf/${digest}.pdf`;

    const stored = await uploadObject(storageKey, bytes, "application/pdf");

    const { templateService } = await buildContractServices();
    const version = await templateService.createVersion({
      templateId: params.id,
      pdfStorageKey: stored.key,
      pdfFilename: archivo.name,
    });
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

/** PUT /api/templates/:id/versions  { versionId } → publica la versión. */
export async function PUT(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.TEMPLATE_MANAGE);
    if (denied) return denied;

    const body = (await request.json()) as { versionId: string };
    const { templateService } = await buildContractServices();
    const published = await templateService.publishVersion(body.versionId);
    return NextResponse.json(published);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}