import { NextResponse } from "next/server";
import { GET as getReporteSemanal } from "../route";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
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
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    for (const permission of [
      Permission.CONTRACT_READ,
      Permission.DOCUMENT_READ,
      Permission.WORK_ORDER_READ,
      Permission.SCORING_READ,
    ]) {
      const denied = requirePermission(auth.user, permission);
      if (denied) return denied;
    }

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
