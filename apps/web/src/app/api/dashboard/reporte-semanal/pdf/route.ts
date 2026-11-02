import { NextResponse } from "next/server";
import { GET as getReporteSemanal } from "../route";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import {
  renderReporteSemanalHtml,
  type ReporteSemanalPdf,
} from "@/lib/pdf/render-dashboard-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const response = await getReporteSemanal(request);
    if (!response.ok) return response;

    const reporte = (await response.json()) as ReporteSemanalPdf;
    const pdf = await generateHtmlPdf(
      renderReporteSemanalHtml(reporte),
      "informe-semanal.pdf",
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
