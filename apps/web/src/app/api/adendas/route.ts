import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { generateAdendaPdf } from "@/lib/pdf/generate-pdf";
import { registerGeneratedDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/adendas  body: { contractId, titulo, contenido }
 * Crea una adenda del contrato: congela un snapshot de adenda, la registra
 * como documento (tipo ADENDA) y devuelve el PDF generado como descarga.
 */
export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await request.json()) as {
      contractId?: string;
      titulo?: string;
      contenido?: string;
    };

    if (!body.contractId) {
      return NextResponse.json(
        { error: "contractId requerido" },
        { status: 400 }
      );
    }
    const titulo = (body.titulo ?? "").trim() || "ADENDA";
    const contenido = (body.contenido ?? "").trim();
    if (!contenido) {
      return NextResponse.json(
        { error: "Debe indicar el contenido de la adenda" },
        { status: 400 }
      );
    }

    const services = await buildContractServices({
      userId: auth.user.id,
      name: auth.user.name,
    });
    const contract = await services.contractRepository.findWithRelations(
      body.contractId
    );
    if (!contract) {
      return NextResponse.json(
        { error: "Contrato no encontrado" },
        { status: 404 }
      );
    }
    const ESTADOS_ADENDA = ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO"] as const;
    if (!ESTADOS_ADENDA.includes(contract.estado as (typeof ESTADOS_ADENDA)[number])) {
      return NextResponse.json(
        { error: "La adenda solo puede crearse sobre contratos emitidos, pendientes de firma o firmados" },
        { status: 400 }
      );
    }
    if (!contract.snapshot || !contract.snapshot.inmutable) {
      return NextResponse.json(
        { error: "El contrato no tiene un snapshot emitido para documentar la adenda" },
        { status: 400 }
      );
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq, and, count } = await import("drizzle-orm");

    const [{ value: nAdendas = 0 } = {}] = await db
      .select({ value: count() })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.contractId, contract.id),
          eq(schema.documents.tipo, "ADENDA")
        )
      );
    const numero = Number(nAdendas) + 1;
    const codigoAdenda = `${contract.codigoContrato}-ADD-${numero}`;

    const snapshot = await services.snapshotRepository.create({
      codigoContrato: codigoAdenda,
      plantillaVersionId: contract.plantillaVersionId,
      datosCliente: (contract.snapshot.datosCliente ??
        contract.cliente) as unknown as Record<string, unknown>,
      datosDepartamento: (contract.snapshot.datosDepartamento ??
        contract.departamento) as unknown as Record<string, unknown>,
      datosContrato: {
        ...(contract.snapshot.datosContrato as Record<string, unknown>),
        codigoContrato: codigoAdenda,
        tipoDocumento: "ADENDA",
        titulo,
      },
      clausulas: [],
      anexos: [
        {
          versionId: randomUUID(),
          contenido: `${titulo}\n\n${contenido}`,
        },
      ],
    });

    await services.snapshotRepository.markImmutable(
      snapshot.id,
      new Date().toISOString()
    );

    let pdf: Awaited<ReturnType<typeof generateAdendaPdf>>;
    try {
      pdf = await generateAdendaPdf(snapshot);
    } catch (error) {
      await db.insert(schema.documents).values({
        contractId: contract.id,
        snapshotId: snapshot.id,
        tipo: "ADENDA",
        version: numero,
        filename: `${codigoAdenda}.pdf`,
        mimeType: "application/pdf",
        estadoGeneracion: "ERROR",
        error: (error as Error).message,
        idempotencyKey: `contract:${contract.id}:adenda:${snapshot.id}`,
      });
      throw error;
    }

    const row = await registerGeneratedDocument(db, schema, {
      contractId: contract.id,
      snapshotId: snapshot.id,
      tipo: "ADENDA",
      version: numero,
      filename: pdf.filename,
      bytes: pdf.bytes,
      idempotencyKey: `contract:${contract.id}:adenda:${snapshot.id}`,
    });
    if (row.estadoGeneracion === "ERROR") {
      return NextResponse.json(
        { error: row.error ?? "No se pudo almacenar la adenda en storage" },
        { status: 500 }
      );
    }

    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = /Chrome|snapshot emitido|solo puede crearse|requerido|contenido/.test(
      message
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}