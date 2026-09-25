import { NextResponse } from "next/server";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { generateHtmlPdf } from "@/lib/pdf/generate-pdf";
import {
  buildBoletaSeparacion,
  renderBoletaSeparacionHtml,
} from "@/lib/pdf/render-boleta-separacion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface BoletaPdfBody {
  contactoId?: string;
  departamentoId?: string;
  checkIn?: string;
  checkOut?: string;
  diaPago?: string;
}

/** POST /api/separaciones/pdf { contactoId, departamentoId } — genera la Boleta de Separación. */
export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const body = (await request.json()) as BoletaPdfBody;
    if (!body.contactoId || !body.departamentoId) {
      return NextResponse.json(
        { error: "contactoId y departamentoId son requeridos" },
        { status: 400 }
      );
    }

    const [contacto] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, body.contactoId));
    if (!contacto) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    const [departamento] = await db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, body.departamentoId));
    if (!departamento) {
      return NextResponse.json({ error: "Departamento no encontrado" }, { status: 404 });
    }

    const [separacion] = await db
      .select()
      .from(schema.separations)
      .where(eq(schema.separations.departamentoId, body.departamentoId));

    const [contrato] = await db
      .select()
      .from(schema.contracts)
      .where(
        and(
          eq(schema.contracts.departamentoId, body.departamentoId),
          or(
            ne(schema.contracts.estado, "CANCELADO"),
            ne(schema.contracts.estado, "RESUELTO")
          )
        )
      )
      .orderBy(desc(schema.contracts.fechaInicio))
      .limit(1);

    const data = buildBoletaSeparacion({
      contacto: {
        nombre: contacto.nombre,
        apellido: contacto.apellido,
        dni: contacto.dni,
        domicilio: contacto.domicilio ?? "",
      },
      departamento: {
        numero: departamento.numero,
        codigo: departamento.codigo,
        personaPago: departamento.personaPago,
        precio: departamento.precio,
      },
      separacion: separacion
        ? { montoSeparacion: separacion.montoSeparacion }
        : null,
      contrato: contrato
        ? {
            fechaInicio: contrato.fechaInicio,
            fechaFin: contrato.fechaFin,
          }
        : null,
    });

    if (typeof body.checkIn === "string" && body.checkIn) data.checkIn = body.checkIn;
    if (typeof body.checkOut === "string" && body.checkOut) data.checkOut = body.checkOut;
    if (typeof body.diaPago === "string" && body.diaPago) data.diaPago = body.diaPago;

    const filename = `BOLETA-SEPARACION-${departamento.codigo || "SEPARACION"}.pdf`;
    const pdf = await generateHtmlPdf(renderBoletaSeparacionHtml(data), filename);

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