import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import { renderChecklistHtml } from "@/lib/pdf/render-checklist-html";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;
    const body = (await request.json()) as {
      templateHtml?: unknown;
      filename?: unknown;
      selectedItems?: unknown;
      contact?: Record<string, unknown>;
    };
    if (typeof body.templateHtml !== "string" || body.templateHtml.length > 200_000) {
      return NextResponse.json({ error: "La plantilla HTML no es válida o supera el tamaño máximo" }, { status: 400 });
    }
    if (!body.contact || typeof body.contact.nombre !== "string" || typeof body.contact.dni !== "string") {
      return NextResponse.json({ error: "Selecciona un contacto válido" }, { status: 400 });
    }
    const selectedItems = Array.isArray(body.selectedItems)
      ? body.selectedItems.filter((item): item is string => typeof item === "string").slice(0, 500)
      : [];
    const filename = typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
      : "checklist-entrega.pdf";
    const pdf = await generateHtmlPdf(
      renderChecklistHtml(body.templateHtml, body.contact as never, selectedItems),
      filename.endsWith(".pdf") ? filename : `${filename}.pdf`
    );
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": pdf.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}