import { NextResponse } from "next/server";
import { and, gte, lt } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { rangoMesLima } from "@/lib/attendance-day";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import { renderAsistenciaHtml } from "@/lib/pdf/render-asistencia-html";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/asistencias/pdf?month=YYYY-MM — reporte mensual con firmas. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.ATTENDANCE_READ);
    if (denied) return denied;

    const month = new URL(req.url).searchParams.get("month") ?? "";
    const range = rangoMesLima(month);
    if (!range) {
      return NextResponse.json(
        { error: "Mes no válido; usa el formato YYYY-MM" },
        { status: 400 },
      );
    }

    const { db, schema } = dbModule;
    const registros = await db
      .select()
      .from(schema.attendance)
      .where(
        and(
          gte(schema.attendance.createdAt, range.start),
          lt(schema.attendance.createdAt, range.end),
        ),
      )
      .orderBy(schema.attendance.createdAt);
    const filename = `asistencia-${month}.pdf`;
    const pdf = await generateHtmlPdf(
      renderAsistenciaHtml(month, registros),
      filename,
    );

    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": pdf.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
