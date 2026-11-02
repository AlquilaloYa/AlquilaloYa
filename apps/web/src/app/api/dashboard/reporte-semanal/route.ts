import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

interface ActividadSemanal {
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
}

function fechaEnLima(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function inicioSemanaEnLima(fecha: Date): Date {
  const fechaUTC = new Date(`${fechaEnLima(fecha)}T00:00:00Z`);
  const diasDesdeLunes = (fechaUTC.getUTCDay() + 6) % 7;
  fechaUTC.setUTCDate(fechaUTC.getUTCDate() - diasDesdeLunes);
  const inicio = fechaUTC.toISOString().slice(0, 10);
  return new Date(`${inicio}T00:00:00-05:00`);
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
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

    const { db, schema } = dbModule;
    const { and, eq, gte, inArray, isNull, lte } = await import("drizzle-orm");
    const ahora = new Date();
    const inicioSemana = inicioSemanaEnLima(ahora);
    const inicioSemanaStr = fechaEnLima(inicioSemana);
    const fechaCorte = fechaEnLima(ahora);

    const [reportes, reparaciones, contratos, documentos] = await Promise.all([
      db
        .select({
          id: schema.tenantIncidents.id,
          tipo: schema.tenantIncidents.tipo,
          severidad: schema.tenantIncidents.severidad,
          departamento: schema.tenantIncidents.departamentoCodigo,
          fecha: schema.tenantIncidents.createdAt,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
        })
        .from(schema.tenantIncidents)
        .innerJoin(
          schema.clients,
          eq(schema.clients.id, schema.tenantIncidents.clienteId)
        )
        .where(
          and(
            gte(schema.tenantIncidents.createdAt, inicioSemana),
            lte(schema.tenantIncidents.createdAt, ahora),
            isNull(schema.tenantIncidents.eliminadoEn)
          )
        )
        .orderBy(schema.tenantIncidents.createdAt),
      db
        .select({
          id: schema.workOrders.id,
          codigo: schema.workOrders.code,
          titulo: schema.workOrders.title,
          departamento: schema.workOrders.departmentCode,
          estado: schema.workOrders.status,
          fecha: schema.workOrders.completedAt,
        })
        .from(schema.workOrders)
        .where(
          and(
            inArray(schema.workOrders.status, ["RESOLVED", "COMPLETED"]),
            gte(schema.workOrders.completedAt, inicioSemana),
            lte(schema.workOrders.completedAt, ahora)
          )
        )
        .orderBy(schema.workOrders.completedAt),
      db
        .select({
          id: schema.contracts.id,
          codigo: schema.contracts.codigoContrato,
          estado: schema.contracts.estado,
          fecha: schema.contracts.creadoEn,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
          departamento: schema.departments.codigo,
        })
        .from(schema.contracts)
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId)
        )
        .leftJoin(
          schema.departments,
          eq(schema.departments.id, schema.contracts.departamentoId)
        )
        .where(
          and(
            gte(schema.contracts.creadoEn, inicioSemana),
            lte(schema.contracts.creadoEn, ahora),
            isNull(schema.contracts.eliminadoEn)
          )
        )
        .orderBy(schema.contracts.creadoEn),
      db
        .select({
          id: schema.documents.id,
          contractId: schema.documents.contractId,
          tipo: schema.documents.tipo,
          fecha: schema.documents.createdAt,
          datosContrato: schema.contractSnapshots.datosContrato,
          codigo: schema.contracts.codigoContrato,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
          departamento: schema.departments.codigo,
        })
        .from(schema.documents)
        .leftJoin(
          schema.contractSnapshots,
          eq(schema.contractSnapshots.id, schema.documents.snapshotId)
        )
        .leftJoin(
          schema.contracts,
          eq(schema.contracts.id, schema.documents.contractId)
        )
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId)
        )
        .leftJoin(
          schema.departments,
          eq(schema.departments.id, schema.contracts.departamentoId)
        )
        .where(
          and(
            inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"]),
            eq(schema.documents.estadoGeneracion, "GENERADO"),
            gte(schema.documents.createdAt, inicioSemana),
            lte(schema.documents.createdAt, ahora),
            isNull(schema.documents.eliminadoEn)
          )
        )
        .orderBy(schema.documents.createdAt),
    ]);

    const adendasNuevas: ActividadSemanal[] = documentos.map((documento) => ({
      id: documento.id,
      titulo: `${documento.tipo.replace(/_/g, " ")} · ${documento.codigo ?? "Contrato"}`,
      detalle: [
        [documento.nombres, documento.apellidos].filter(Boolean).join(" "),
        documento.departamento,
      ]
        .filter(Boolean)
        .join(" · "),
      fecha: documento.fecha.toISOString(),
    }));

    const renovacionesPorContrato = new Map<string, ActividadSemanal>();
    for (const documento of documentos) {
      const datos = (documento.datosContrato ?? {}) as Record<string, unknown>;
      const fechaFinAdenda =
        typeof datos.fechaFinAdenda === "string"
          ? datos.fechaFinAdenda.slice(0, 10)
          : "";
      const fechaFinSnapshot =
        typeof datos.fechaFin === "string" ? datos.fechaFin.slice(0, 10) : "";
      const fechaFinAnterior =
        typeof datos.fechaFinAnterior === "string"
          ? datos.fechaFinAnterior.slice(0, 10)
          : documento.tipo === "ADENDA" && fechaFinAdenda > fechaFinSnapshot
            ? fechaFinSnapshot
            : "";
      const esRenovacion =
        documento.tipo === "ADENDA_EXTENSION" ||
        Boolean(fechaFinAdenda && fechaFinAnterior);
      if (!esRenovacion || !fechaFinAnterior) continue;

      const nombre = [documento.nombres, documento.apellidos]
        .filter(Boolean)
        .join(" ");
      const renovacion: ActividadSemanal = {
        id: `${documento.contractId}:${fechaFinAnterior}`,
        titulo: documento.codigo ?? "Contrato renovado",
        detalle: [
          nombre,
          documento.departamento,
          `Vencimiento anterior: ${fechaFinAnterior}`,
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: documento.fecha.toISOString(),
      };
      renovacionesPorContrato.set(renovacion.id, renovacion);
    }

    const reporte = {
      inicioSemana: inicioSemanaStr,
      fechaCorte,
      renovaciones: [...renovacionesPorContrato.values()],
      reportesClientes: reportes.map((reporte) => ({
        id: reporte.id,
        titulo: `${reporte.nombres} ${reporte.apellidos ?? ""}`.trim(),
        detalle: [
          reporte.tipo,
          reporte.severidad,
          reporte.departamento ? `Dpto. ${reporte.departamento}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: reporte.fecha.toISOString(),
      })),
      reparaciones: reparaciones.map((reparacion) => ({
        id: reparacion.id,
        titulo: reparacion.titulo,
        detalle: [
          reparacion.codigo,
          reparacion.departamento,
          reparacion.estado === "COMPLETED" ? "Completada" : "Resuelta",
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: reparacion.fecha!.toISOString(),
      })),
      contratosNuevos: contratos.map((contrato) => ({
        id: contrato.id,
        titulo: contrato.codigo,
        detalle: [
          [contrato.nombres, contrato.apellidos].filter(Boolean).join(" "),
          contrato.departamento,
          contrato.estado,
        ]
          .filter(Boolean)
          .join(" · "),
        fecha: contrato.fecha.toISOString(),
      })),
      adendasNuevas,
    };

    return NextResponse.json(reporte);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
