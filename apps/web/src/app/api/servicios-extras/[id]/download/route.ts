import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { generateServiciosExtrasPdf } from "@/lib/pdf/generate-servicios-extras-pdf";
import { downloadObject } from "@/lib/storage";
import { sha256Hex } from "@/lib/hash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select()
      .from(schema.serviciosExtras)
      .where(eq(schema.serviciosExtras.id, id))
      .limit(1);
    if (!row) {
      return NextResponse.json(
        { error: "Registro no encontrado" },
        { status: 404 },
      );
    }

    // 1) Copia almacenada: se sirve verificando su integridad (sha256).
    if (row.storageKey) {
      const bytes = await downloadObject(row.storageKey);
      if (row.sha256 && sha256Hex(bytes) !== row.sha256) {
        return NextResponse.json(
          {
            error:
              "Integridad comprometida: el archivo almacenado no coincide con su huella sha256.",
          },
          { status: 409 },
        );
      }
      return pdfResponse(bytes, row.filename ?? `servicios-extras-${row.codigoContrato}.pdf`);
    }

    // 2) Sin copia almacenada: se regenera en vivo y se devuelve.
    const [contract] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.id, row.contractId))
      .limit(1);
    const [cliente] = row.clienteId
      ? await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.id, row.clienteId))
          .limit(1)
      : [];
    const [depto] = contract
      ? await db
          .select()
          .from(schema.departments)
          .where(eq(schema.departments.id, contract.departamentoId))
          .limit(1)
      : [];

    const pdf = await generateServiciosExtrasPdf(row, contract, cliente, depto);
    return pdfResponse(pdf.bytes, pdf.filename);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
