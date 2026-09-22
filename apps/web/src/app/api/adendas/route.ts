import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { generateAdendaPdf } from "@/lib/pdf/generate-pdf";
import { findDocumentById, registerGeneratedDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MONTO = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function dstr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  date.setUTCMonth(date.getUTCMonth() + months);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

function fmtFechaEs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[(m as number) - 1]} de ${y}`;
}

/** Fecha de término de la adenda según su snapshot (fin del plazo extendido). */
function finAdenda(tipo: string, datos: unknown): string | null {
  const d = (datos ?? {}) as Record<string, unknown>;
  if (tipo === "ADENDA_EXTENSION") {
    const f = d.fechaFin;
    return String(f ?? "").slice(0, 10) || null;
  }
  const f = d.fechaFinAdenda;
  return String(f ?? "").slice(0, 10) || null;
}

/** Períodos mensuales nuevos del canon entre cursor (< nuevaFechaFin). */
function periodosExtension(fechaFinActual: string, nuevaFechaFin: string): string[] {
  const periodos: string[] = [];
  let cursor = fechaFinActual;
  let guard = 0;
  while (cursor < nuevaFechaFin && guard < 240) {
    periodos.push(cursor);
    cursor = addMonthsIso(cursor, 1);
    guard += 1;
  }
  return periodos;
}

/** GET /api/adendas — lista todas las adendas (ADENDA y ADENDA_EXTENSION) con datos del contrato. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.DOCUMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq, inArray, desc } = await import("drizzle-orm");

    const rows = await db
      .select({
        id: schema.documents.id,
        contractId: schema.documents.contractId,
        snapshotId: schema.documents.snapshotId,
        tipo: schema.documents.tipo,
        version: schema.documents.version,
        storageKey: schema.documents.storageKey,
        filename: schema.documents.filename,
        sizeBytes: schema.documents.sizeBytes,
        sha256: schema.documents.sha256,
        estadoGeneracion: schema.documents.estadoGeneracion,
        error: schema.documents.error,
        createdAt: schema.documents.createdAt,
        datosContrato: schema.contractSnapshots.datosContrato,
        anexos: schema.contractSnapshots.anexos,
        codigoContrato: schema.contracts.codigoContrato,
        estadoContrato: schema.contracts.estado,
        clienteId: schema.clients.id,
        clienteNombre: schema.clients.nombres,
        clienteApellidos: schema.clients.apellidos,
        clienteDocumento: schema.clients.documentoIdentidad,
        departamentoNombre: schema.departments.nombre,
        departamentoCodigo: schema.departments.codigo,
      })
      .from(schema.documents)
      .innerJoin(schema.contracts, eq(schema.documents.contractId, schema.contracts.id))
      .innerJoin(schema.clients, eq(schema.contracts.clienteId, schema.clients.id))
      .innerJoin(schema.departments, eq(schema.contracts.departamentoId, schema.departments.id))
      .leftJoin(
        schema.contractSnapshots,
        eq(schema.documents.snapshotId, schema.contractSnapshots.id)
      )
      .where(inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"]))
      .orderBy(desc(schema.documents.createdAt));

    return NextResponse.json({
      items: rows.map((d) => ({
        id: d.id,
        contractId: d.contractId,
        snapshotId: d.snapshotId,
        tipo: d.tipo,
        version: d.version,
        storageKey: d.storageKey,
        filename: d.filename,
        sizeBytes: d.sizeBytes,
        sha256: d.sha256,
        estadoGeneracion: d.estadoGeneracion,
        error: d.error,
        createdAt: d.createdAt?.toISOString?.() ?? null,
        fechaFinAdenda: finAdenda(d.tipo, d.datosContrato),
        datosContrato: d.datosContrato as Record<string, unknown> | null,
        anexoContenido: (Array.isArray(d.anexos) ? d.anexos[0]?.contenido : null) ?? null,
        codigoContrato: d.codigoContrato,
        estadoContrato: d.estadoContrato,
        clienteId: d.clienteId,
        clienteNombre: d.clienteNombre,
        clienteApellidos: d.clienteApellidos,
        clienteDocumento: d.clienteDocumento,
        departamentoNombre: d.departamentoNombre,
        departamentoCodigo: d.departamentoCodigo,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/adendas  body: { contractId, titulo, contenido, tipo?, nuevaFechaFin? }
 * - tipo "adenda" (default): congela un snapshot de adenda, la registra como
 *   documento (tipo ADENDA) y devuelve el PDF generado como descarga.
 * - tipo "extension": además actualiza la fecha de fin del contrato, crea las
 *   cuotas (payments PENDIENTE) de los meses extendidos y registra el
 *   documento tipo ADENDA_EXTENSION con su PDF.
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
      tipo?: "adenda" | "extension";
      nuevaFechaFin?: string;
      numeroAdenda?: string;
      fechaInicioAdenda?: string;
      fechaFinAdenda?: string;
    };

    if (!body.contractId) {
      return NextResponse.json(
        { error: "contractId requerido" },
        { status: 400 }
      );
    }
    const esExtension = body.tipo === "extension";
    const titulo = (body.titulo ?? "").trim() || (esExtension ? "ADENDA DE EXTENSIÓN" : "ADENDA");
    const contenido = (body.contenido ?? "").trim();
    if (!esExtension && !contenido && !body.fechaInicioAdenda && !body.fechaFinAdenda) {
      return NextResponse.json(
        { error: "Debe indicar el contenido de la adenda o las fechas del nuevo plazo" },
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
    const ESTADOS_ADENDA = ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO"] as const;
    if (!ESTADOS_ADENDA.includes(contract.estado as (typeof ESTADOS_ADENDA)[number])) {
      return NextResponse.json(
        { error: "La adenda solo puede crearse sobre contratos emitidos, pendientes de firma, firmados o notariados" },
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
    const { eq, and, inArray, count } = await import("drizzle-orm");

    const [{ value: nAdendas = 0 } = {}] = await db
      .select({ value: count() })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.contractId, contract.id),
          inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"])
        )
      );
    const numero = Number(nAdendas) + 1;
    const codigoAdenda = `${contract.codigoContrato}-ADD-${numero}`;

    const fechaFinActual = dstr(contract.fechaFin);
    let nuevaFechaFin = fechaFinActual;
    let cuotasNuevas: string[] = [];
    let camposContrato: Record<string, unknown> = {};

    const fechaInicioAdenda = esExtension
      ? undefined
      : (body.fechaInicioAdenda ?? "").slice(0, 10);
    const fechaFinAdenda = esExtension
      ? undefined
      : (body.fechaFinAdenda ?? "").slice(0, 10);

    // La adenda con plazo es también una extensión: actualiza la fecha de fin
    // del contrato y genera las cuotas de los meses nuevos, con lo que el
    // departamento y la cobranza pasan a ocupado hasta el fin de la adenda.
    const esAdendaConPlazo = !esExtension && Boolean(fechaInicioAdenda && fechaFinAdenda);
    const extiende = esExtension || esAdendaConPlazo;

    if (esExtension) {
      if (!body.nuevaFechaFin) {
        return NextResponse.json(
          { error: "Debe indicar la nueva fecha de fin de la extensión" },
          { status: 400 }
        );
      }
      nuevaFechaFin = String(body.nuevaFechaFin).slice(0, 10);
    } else if (esAdendaConPlazo && fechaInicioAdenda && fechaFinAdenda) {
      if (!(fechaFinAdenda > fechaInicioAdenda)) {
        return NextResponse.json(
          { error: "La fecha fin de la adenda debe ser posterior a la fecha de inicio" },
          { status: 400 }
        );
      }
      nuevaFechaFin = fechaFinAdenda;
    }

    if (extiende) {
      if (!(nuevaFechaFin > fechaFinActual)) {
        return NextResponse.json(
          { error: `La nueva fecha de fin debe ser posterior a la fecha de término actual (${fechaFinActual})` },
          { status: 400 }
        );
      }
      cuotasNuevas = periodosExtension(fechaFinActual, nuevaFechaFin);
      await db
        .update(schema.contracts)
        .set({ fechaFin: nuevaFechaFin, actualizadoEn: new Date() })
        .where(eq(schema.contracts.id, contract.id));

      const monto = Number(contract.montoCanonMensual).toFixed(2);
      const mant = Number(contract.mantenimiento ?? "50").toFixed(2);
      if (cuotasNuevas.length > 0) {
        await db
          .insert(schema.payments)
          .values(
            cuotasNuevas.map((periodo) => ({
              contractId: contract.id,
              periodo,
              monto,
              mantenimiento: mant,
              penalidad: "0",
              estado: "PENDIENTE",
            }))
          )
          .onConflictDoNothing({
            target: [schema.payments.contractId, schema.payments.periodo],
          });
      }
      camposContrato = {
        fechaFinAnterior: fechaFinActual,
        codigoBase: contract.codigoContrato,
      };
    }

    const baseSnapshot = contract.snapshot;
    const datosDepartamento = {
      ...((baseSnapshot.datosDepartamento ??
        contract.departamento) as Record<string, unknown>),
      // Usa la persona de pago VIGENTE del departamento (no la congelada en el
      // snapshot del contrato), para que la adenda salga a nombre del dueño actual.
      personaPago:
        contract.departamento?.personaPago ??
        (baseSnapshot.datosDepartamento as Record<string, unknown> | undefined)
          ?.personaPago,
    };
    const datosContrato = {
      ...(baseSnapshot.datosContrato as Record<string, unknown>),
      codigoContrato: codigoAdenda,
      tipoDocumento: esExtension ? "ADENDA_EXTENSION" : "ADENDA",
      titulo,
      fechaFin: esExtension ? nuevaFechaFin : baseSnapshot.datosContrato?.fechaFin,
      codigoBase: contract.codigoContrato,
      numeroAdenda: esExtension ? undefined : (body.numeroAdenda ?? "").trim() || String(numero),
      fechaInicioAdenda,
      fechaFinAdenda,
      ...camposContrato,
    };

    let anexoContenido = `${titulo}\n\n${contenido}`;
    if (esExtension) {
      const monto = Number(contract.montoCanonMensual).toFixed(2);
      const mant = Number(contract.mantenimiento ?? "50").toFixed(2);
      const lineas = [
        `${titulo}\n`,
        `Por la presente, las partes acuerdan EXTENDER el plazo del Contrato de Arrendamiento ${contract.codigoContrato} sobre el inmueble ${dstrDepartamento(contract)}, en los siguientes términos:`,
        `- Fecha de término original: ${fmtFechaEs(fechaFinActual)}`,
        `- Nueva fecha de término: ${fmtFechaEs(nuevaFechaFin)}`,
        `- Canon mensual: ${MONTO.format(Number(monto))}`,
        `- Mantenimiento mensual: ${MONTO.format(Number(mant))}`,
        ``,
        `Se mantienen vigentes todas las demás cláusulas del contrato original que no se opongan a la presente adenda.`,
      ];
      if (cuotasNuevas.length > 0) {
        lineas.push(
          ``,
          `Anexo: cronograma de las cuotas por el período extendido (${MONTO.format(Number(monto))} cada una):`,
          ...cuotasNuevas.map((p, i) => `Cuota ${i + 1} (${fmtFechaEs(p)}): ${MONTO.format(Number(monto))}`)
        );
      }
      if (contenido) lineas.push(``, contenido);
      anexoContenido = lineas.join("\n");
    }

    const snapshot = await services.snapshotRepository.create({
      codigoContrato: codigoAdenda,
      plantillaVersionId: contract.plantillaVersionId,
      datosCliente: (baseSnapshot.datosCliente ??
        contract.cliente) as unknown as Record<string, unknown>,
      datosDepartamento,
      datosContrato,
      clausulas: [],
      anexos: [
        {
          versionId: randomUUID(),
          contenido: anexoContenido,
        },
      ],
    });

    await services.snapshotRepository.markImmutable(
      snapshot.id,
      new Date().toISOString()
    );

    const tipoDocumento = esExtension ? "ADENDA_EXTENSION" : "ADENDA";

    let pdf: Awaited<ReturnType<typeof generateAdendaPdf>>;
    try {
      pdf = await generateAdendaPdf(snapshot);
    } catch (error) {
      await db.insert(schema.documents).values({
        contractId: contract.id,
        snapshotId: snapshot.id,
        tipo: tipoDocumento,
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
      tipo: tipoDocumento,
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
    const status = /Chrome|snapshot emitido|solo puede crearse|requerido|contenido|posterior/i.test(
      message
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function dstrDepartamento(contract: {
  departamento?: unknown;
  snapshot?: { datosDepartamento?: unknown } | null;
}): string {
  const dept = (contract.snapshot?.datosDepartamento ??
    contract.departamento) as Record<string, unknown> | undefined;
  const nombre = dept?.nombre ?? dept?.nomDepartamento ?? dept?.codigo ?? "";
  return String(nombre || "—");
}

/**
 * PATCH /api/adendas  body: { documentId, titulo?, contenido?, numeroAdenda?,
 * fechaInicioAdenda?, fechaFinAdenda? }
 * Edita una adenda ya generada: actualiza el snapshot de la adenda (título,
 * contenido, numeración y plazo), actualiza el contrato y sus cuotas si el
 * plazo cambió, regenera el PDF y lo reemplaza en storage (mismo documento).
 */
export async function PATCH(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await request.json()) as {
      documentId?: string;
      titulo?: string;
      contenido?: string;
      numeroAdenda?: string;
      fechaInicioAdenda?: string;
      fechaFinAdenda?: string;
    };
    if (!body.documentId) {
      return NextResponse.json(
        { error: "documentId requerido" },
        { status: 400 }
      );
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const doc = await findDocumentById(db, schema, body.documentId);
    if (!doc) {
      return NextResponse.json(
        { error: "Documento de adenda no encontrado" },
        { status: 404 }
      );
    }
    if (!["ADENDA", "ADENDA_EXTENSION"].includes(doc.tipo)) {
      return NextResponse.json(
        { error: "El documento no es una adenda" },
        { status: 400 }
      );
    }
    if (!doc.snapshotId) {
      return NextResponse.json(
        { error: "La adenda no tiene snapshot asociado" },
        { status: 400 }
      );
    }

    const services = await buildContractServices({
      userId: auth.user.id,
      name: auth.user.name,
    });
    const snapshot = await services.snapshotRepository.findById(doc.snapshotId);
    if (!snapshot) {
      return NextResponse.json(
        { error: "Snapshot de la adenda no encontrado" },
        { status: 404 }
      );
    }

    const contratoActual = snapshot.datosContrato as Record<string, unknown>;
    const esExtension = contratoActual.tipoDocumento === "ADENDA_EXTENSION";

    const titulo = (body.titulo ?? "").trim() || String(contratoActual.titulo ?? "ADENDA");
    const numeroAdenda = (body.numeroAdenda ?? "").trim() || String(contratoActual.numeroAdenda ?? "1");
    const contenido = (body.contenido ?? "").trim();
    const fechaInicioAdenda = body.fechaInicioAdenda
      ? body.fechaInicioAdenda.slice(0, 10)
      : String(contratoActual.fechaInicioAdenda ?? "").slice(0, 10);
    const nuevaFechaFinAdenda = body.fechaFinAdenda
      ? body.fechaFinAdenda.slice(0, 10)
      : String(contratoActual.fechaFinAdenda ?? "").slice(0, 10);

    if (!esExtension && nuevaFechaFinAdenda && fechaInicioAdenda && !(nuevaFechaFinAdenda > fechaInicioAdenda)) {
      return NextResponse.json(
        { error: "La fecha fin de la adenda debe ser posterior a la fecha de inicio" },
        { status: 400 }
      );
    }

    const contract = await services.contractRepository.findWithRelations(doc.contractId);
    if (!contract) {
      return NextResponse.json(
        { error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    // 1) Si el plazo de la adenda cambió, actualizar contrato y cuotas.
    const fechaFinActual = dstr(contract.fechaFin);
    const esAdendaConPlazo = !esExtension && Boolean(fechaInicioAdenda && nuevaFechaFinAdenda);
    const extiende = esExtension || esAdendaConPlazo;
    if (extiende && nuevaFechaFinAdenda && nuevaFechaFinAdenda !== contratoActual.fechaFinAdenda) {
      if (!(nuevaFechaFinAdenda > fechaFinActual)) {
        return NextResponse.json(
          { error: `La nueva fecha de fin debe ser posterior a la fecha de término actual (${fechaFinActual})` },
          { status: 400 }
        );
      }
      const cuotasNuevas = periodosExtension(fechaFinActual, nuevaFechaFinAdenda);
      await db
        .update(schema.contracts)
        .set({ fechaFin: nuevaFechaFinAdenda, actualizadoEn: new Date() })
        .where(eq(schema.contracts.id, contract.id));
      const monto = Number(contract.montoCanonMensual).toFixed(2);
      const mant = Number(contract.mantenimiento ?? "50").toFixed(2);
      if (cuotasNuevas.length > 0) {
        await db
          .insert(schema.payments)
          .values(
            cuotasNuevas.map((periodo) => ({
              contractId: contract.id,
              periodo,
              monto,
              mantenimiento: mant,
              penalidad: "0",
              estado: "PENDIENTE",
            }))
          )
          .onConflictDoNothing({
            target: [schema.payments.contractId, schema.payments.periodo],
          });
      }
    }

    // 2) Snapshot actualizado (título, numeración, contenido y plazo).
    const datosContrato = {
      ...contratoActual,
      titulo,
      numeroAdenda,
      fechaInicioAdenda: esExtension ? contratoActual.fechaInicioAdenda : fechaInicioAdenda,
      fechaFinAdenda: esExtension ? contratoActual.fechaFinAdenda : nuevaFechaFinAdenda,
    };
    const anexos = esExtension
      ? snapshot.anexos
      : [
          {
            versionId: randomUUID(),
            contenido: `${titulo}\n\n${contenido}`,
          },
        ];

    await db
      .update(schema.contractSnapshots)
      .set({
        datosContrato,
        anexos: anexos as unknown as Record<string, unknown>,
      })
      .where(eq(schema.contractSnapshots.id, snapshot.id));

    // 3) Regenerar el PDF desde el snapshot actualizado y reemplazarlo.
    const snapshotActualizado = { ...snapshot, datosContrato, anexos };
    let pdf: Awaited<ReturnType<typeof generateAdendaPdf>>;
    try {
      pdf = await generateAdendaPdf(snapshotActualizado);
    } catch (error) {
      return NextResponse.json(
        {
          error: `No se pudo regenerar la adenda: ${(error as Error).message}`,
        },
        { status: 500 }
      );
    }

    const row = await registerGeneratedDocument(db, schema, {
      contractId: doc.contractId,
      snapshotId: snapshot.id,
      tipo: doc.tipo,
      version: doc.version,
      filename: pdf.filename,
      bytes: pdf.bytes,
      idempotencyKey: doc.idempotencyKey,
      force: true,
    });
    if (row.estadoGeneracion === "ERROR") {
      return NextResponse.json(
        { error: row.error ?? "No se pudo almacenar la adenda editada en storage" },
        { status: 500 }
      );
    }

    await db.insert(schema.activity_events).values({
      userId: auth.user.id as unknown as string,
      actorType: "user",
      action: "adenda.update",
      module: "CONTRACTS",
      entityType: "ADENDA",
      entityId: doc.id,
      result: "SUCCESS",
      metadata: {
        contractId: contract.id,
        snapshotId: snapshot.id,
        documentId: doc.id,
        codigoAdenda: snapshot.codigoContrato,
      } as Record<string, unknown>,
    });

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
    const status = /requerido|posterior|adenda|snapshot|no encontrado/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}