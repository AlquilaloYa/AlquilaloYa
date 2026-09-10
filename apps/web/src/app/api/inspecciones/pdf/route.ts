import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import { renderInspeccionHtml } from "@/lib/pdf/render-inspeccion-html";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/inspecciones/pdf { id } — PDF con SOLO los checks negativos + descripcion. */
export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [row] = await db
      .select()
      .from(schema.inspections)
      .where(eq(schema.inspections.id, body.id));
    if (!row) {
      return NextResponse.json({ error: "Inspeccion no encontrada" }, { status: 404 });
    }
    const items = Array.isArray(row.items) ? (row.items as never[]) : [];
    const pdf = await generateHtmlPdf(
      renderInspeccionHtml({
        titulo: row.nombre,
        numero: row.numero,
        personaInspecciona: row.personaInspecciona || row.contactoNombre,
        inspectorNombre: row.inspectorNombre,
        departamentoNombre: row.departamentoNombre,
        asignadoA: row.asignadoA,
        fecha: row.fecha.toISOString(),
        estado: row.estado,
        items: items.map((x) => {
          const item = x as Record<string, unknown>;
          const out: {
            categoria?: string;
            texto: string;
            resultado: "OK" | "NEGATIVO" | "";
            motivo?: string;
          } = {
            texto: typeof item.texto === "string" ? item.texto : "",
            resultado:
              item.resultado === "OK" || item.resultado === "NEGATIVO"
                ? item.resultado
                : "",
            motivo: typeof item.motivo === "string" ? item.motivo : "",
          };
          if (typeof item.categoria === "string") out.categoria = item.categoria;
          return out;
        }),
      }),
      `${(row.numero || row.nombre || row.departamentoNombre).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 60) || "inspeccion"}.pdf`
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
