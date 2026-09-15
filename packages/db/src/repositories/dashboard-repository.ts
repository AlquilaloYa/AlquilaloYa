import { and, count, eq, gte, inArray, lte, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "../index";

export type ContractEstados = {
  borradores: number;
  pendientesEmision: number;
  pendientesFirma: number;
  emitidos: number;
  firmados: number;
  cancelados: number;
  total: number;
};

export interface DashboardMetrics {
  contratos: ContractEstados;
  erroresGeneracion: number;
}

export interface ProximoAVencer {
  id: string;
  codigoContrato: string;
  cliente: string;
  departamento: string | null;
  fechaFin: string;
  diasRestantes: number;
}

export interface ResumenPortafolio {
  unidadesTotales: number;
  ocupadas: number;
  disponibles: number;
  tasaOcupacion: number;
  mantenimiento: number;
  aPuntoDeFinalizar: number;
  proximosAVencer: ProximoAVencer[];
  ingresosYTD: number;
  egresos: number;
  resultadosYTD: number;
  incidencias: number;
  morosidad: number;
  clientesReportados: number;
  enProceso: number;
}

/** Agrega las métricas del dashboard (Fase 5). */
export class DrizzleDashboardRepository {
  async getContractMetrics(): Promise<DashboardMetrics> {
    const rows = await db
      .select({ estado: schema.contracts.estado, value: count() })
      .from(schema.contracts)
      .groupBy(schema.contracts.estado);

    const byState = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      byState.set(r.estado, r.value);
      total += r.value;
    }

    return {
      contratos: {
        total,
        borradores: byState.get("BORRADOR") ?? 0,
        pendientesEmision: byState.get("PENDIENTE_EMISION") ?? 0,
        pendientesFirma: byState.get("PENDIENTE_FIRMA") ?? 0,
        emitidos: byState.get("EMITIDO") ?? 0,
        firmados: byState.get("FIRMADO") ?? 0,
        cancelados: byState.get("CANCELADO") ?? 0,
      },
      erroresGeneracion: await this.contarErroresGeneracion(),
    };
  }

  private async contarErroresGeneracion(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(schema.documents)
      .where(eq(schema.documents.estadoGeneracion, "ERROR"));
    return row?.value ?? 0;
  }

  /** Portafolio: ocupación, cobranza, incidencias y pipeline contractual. */
  async getResumenPortafolio(): Promise<ResumenPortafolio> {
    const [deptRow] = await db.select({ value: count() }).from(schema.departments);
    const unidadesTotales = deptRow?.value ?? 0;

    const hoy = new Date();
    const hoyStr = toDateStr(hoy);
    const finMantenimiento = new Date(hoy);
    finMantenimiento.setDate(hoy.getDate() + 7);
    const finMantenimientoStr = toDateStr(finMantenimiento);
    const finProximo = new Date(hoy);
    finProximo.setDate(hoy.getDate() + 30);
    const finProximoStr = toDateStr(finProximo);

    const firmas = await db
      .select({
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .where(
        inArray(schema.contracts.estado, [
          "FIRMADO",
          "ACTIVO",
          "VIGENTE",
          "NOTARIADO",
        ])
      );

    const ocupadas = new Set(
      firmas
        .filter((c) => c.fechaInicio <= hoyStr && (c.fechaFin ?? "") >= hoyStr)
        .map((c) => c.departamentoId)
    ).size;

    let mantenimiento = 0;
    let aPuntoDeFinalizar = 0;
    for (const c of firmas) {
      if (!(c.fechaInicio <= hoyStr && (c.fechaFin ?? "") >= hoyStr)) continue;
      if (c.fechaFin && c.fechaFin <= finMantenimientoStr) {
        mantenimiento++;
      }
      if (c.fechaFin && c.fechaFin <= finProximoStr) {
        aPuntoDeFinalizar++;
      }
    }

    const porVencer = await db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        fechaFin: schema.contracts.fechaFin,
        cliente: sql<string>`trim(coalesce(${schema.clients.nombres}, '') || ' ' || coalesce(${schema.clients.apellidos}, ''))`,
        departamento: schema.departments.codigo,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId)
      )
      .where(
        and(
          inArray(schema.contracts.estado, [
            "EMITIDO",
            "PENDIENTE_FIRMA",
            "FIRMADO",
            "NOTARIADO",
          ]),
          gte(schema.contracts.fechaFin, hoyStr),
          lte(schema.contracts.fechaFin, finProximoStr)
        )
      )
      .orderBy(schema.contracts.fechaFin);

    const proximosAVencer: ProximoAVencer[] = porVencer.map((c) => {
      const dias = Math.round(
        (new Date(`${c.fechaFin}T12:00:00`).getTime() - hoy.getTime()) / 86400000
      );
      return {
        id: c.id,
        codigoContrato: c.codigoContrato,
        cliente: c.cliente || "—",
        departamento: c.departamento ?? null,
        fechaFin: c.fechaFin,
        diasRestantes: Math.max(0, dias),
      };
    });

    const hoyInicioAnioStr = toDateStr(new Date(hoy.getFullYear(), 0, 1));
    const pagosAnio = await db
      .select({
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.estado, "PAGADO"),
          gte(schema.payments.periodo, hoyInicioAnioStr),
          lte(schema.payments.periodo, hoyStr)
        )
      );
    let ingresosYTD = 0;
    for (const p of pagosAnio) {
      ingresosYTD += Number(p.monto) + Number(p.mantenimiento);
    }
    ingresosYTD = Math.round(ingresosYTD * 100) / 100;
    const egresos = 0;
    const resultadosYTD = Math.round((ingresosYTD - egresos) * 100) / 100;

    const [enProcesoRow] = await db
      .select({ value: count() })
      .from(schema.contracts)
      .where(
        inArray(schema.contracts.estado, [
          "PENDIENTE_EMISION",
          "EMITIDO",
          "PENDIENTE_FIRMA",
        ])
      );
    const enProceso = enProcesoRow?.value ?? 0;

    const vencidos = await db
      .select({
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        contractId: schema.payments.contractId,
      })
      .from(schema.payments)
      .where(
        and(eq(schema.payments.estado, "PENDIENTE"), lt(schema.payments.periodo, hoyStr))
      );

    let montoVencido = 0;
    const contratosMorosos = new Set<string>();
    for (const p of vencidos) {
      montoVencido += Number(p.monto) + Number(p.mantenimiento);
      contratosMorosos.add(p.contractId);
    }

    const [devengadoRow] = await db
      .select({
        value: sql<number>`coalesce(sum(${schema.payments.monto} + ${schema.payments.mantenimiento}), 0)`,
      })
      .from(schema.payments)
      .where(
        and(
          lte(schema.payments.periodo, hoyStr),
          ne(schema.payments.estado, "CANCELADO")
        )
      );
    const montoDevengado = Number(devengadoRow?.value ?? 0);
    const morosidad =
      montoDevengado > 0
        ? Math.round((montoVencido / montoDevengado) * 100)
        : 0;

    let clientesReportados = 0;
    if (contratosMorosos.size > 0) {
      const clientes = await db
        .select({ clienteId: schema.contracts.clienteId })
        .from(schema.contracts)
        .where(inArray(schema.contracts.id, Array.from(contratosMorosos)));
      clientesReportados = new Set(clientes.map((c) => c.clienteId)).size;
    }

    const erroresGeneracion = await this.contarErroresGeneracion();
    const [fallosActividad] = await db
      .select({ value: count() })
      .from(schema.activity_events)
      .where(inArray(schema.activity_events.result, ["FAILURE", "DENIED"]));
    const incidencias =
      erroresGeneracion + (fallosActividad?.value ?? 0) + vencidos.length;

    return {
      unidadesTotales,
      ocupadas,
      disponibles: Math.max(0, unidadesTotales - ocupadas),
      tasaOcupacion: unidadesTotales
        ? Math.round((ocupadas / unidadesTotales) * 100)
        : 0,
      mantenimiento,
      aPuntoDeFinalizar,
      proximosAVencer,
      ingresosYTD,
      egresos,
      resultadosYTD,
      incidencias,
      morosidad,
      clientesReportados,
      enProceso,
    };
  }
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
