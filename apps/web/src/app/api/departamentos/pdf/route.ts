import { NextResponse } from "next/server";
import { GET as getDepartamentos } from "../route";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import {
  renderDisponiblesHtml,
  type DepartamentoReportePdf,
} from "@/lib/pdf/render-dashboard-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const response = await getDepartamentos(request);
    if (!response.ok) return response;

    const data: unknown = await response.json();
    if (
      !Array.isArray(data) ||
      !data.every(
        (item): item is DepartamentoReportePdf =>
          typeof item === "object" &&
          item !== null &&
          typeof item.codigo === "string" &&
          typeof item.nombre === "string" &&
          typeof item.numero === "string" &&
          typeof item.activo === "boolean",
      )
    ) {
      return NextResponse.json(
        { error: "No se pudo preparar la información de departamentos" },
        { status: 500 },
      );
    }

    const pdf = await generateHtmlPdf(
      renderDisponiblesHtml(data),
      "disponibilidad-departamentos.pdf",
    );
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": pdf.mimeType,
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
