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
  renuevaProximoMes: boolean | null;
  renovacionMeses: number | null;
}

export interface PagoVenceHoy {
  id: string;
  codigoContrato: string;
  cliente: string;
  departamento: string | null;
  monto: number;
  periodo: string;
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
  pagosVencenHoy: PagoVenceHoy[];
  contratosRenovados: number;
  contratosVencidosPeriodo: number;
  tasaRenovacion: number;
  duracionMediaContratoDias: number | null;
  duracionContratos: { label: string; cantidad: number }[];
  vacanciaMediaDias: number | null;
  vacanciasObservadas: number;
  distribucionVacancia: { label: string; cantidad: number }[];
  vacanciaActualMediaDias: number | null;
  departamentosLibresConHistorial: number;
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
        id: schema.contracts.id,
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        estado: schema.contracts.estado,
        renovadoDe: schema.contracts.renovadoDe,
        resueltoEn: schema.contracts.resueltoEn,
      })
      .from(schema.contracts)
      .where(
        inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO", "RESUELTO"])
      );

    const ocupadas = new Set(
      firmas
        .filter(
          (c) =>
            c.estado !== "RESUELTO" &&
            c.fechaInicio <= hoyStr &&
            (c.fechaFin ?? "") >= hoyStr
        )
        .map((c) => c.departamentoId)
    ).size;

    let mantenimiento = 0;
    let aPuntoDeFinalizar = 0;
    for (const c of firmas) {
      if (
        c.estado === "RESUELTO" ||
        !(c.fechaInicio <= hoyStr && (c.fechaFin ?? "") >= hoyStr)
      ) continue;
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
        renuevaProximoMes: schema.contracts.renuevaProximoMes,
        renovacionMeses: schema.contracts.renovacionMeses,
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
        renuevaProximoMes: c.renuevaProximoMes ?? null,
        renovacionMeses: c.renovacionMeses ?? null,
      };
    });

    const adendas = await db
      .select({
        contractId: schema.documents.contractId,
        tipo: schema.documents.tipo,
        datosContrato: schema.contractSnapshots.datosContrato,
      })
      .from(schema.documents)
      .leftJoin(
        schema.contractSnapshots,
        eq(schema.contractSnapshots.id, schema.documents.snapshotId)
      )
      .where(
        and(
          inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"]),
          eq(schema.documents.estadoGeneracion, "GENERADO")
        )
      );

    const inicioVentanaRenovacion = new Date(hoy);
    inicioVentanaRenovacion.setFullYear(inicioVentanaRenovacion.getFullYear() - 1);
    const inicioVentanaRenovacionStr = toDateStr(inicioVentanaRenovacion);
    const renovacionesPorContrato = new Map<string, Set<string>>();
    for (const adenda of adendas) {
      const datos = (adenda.datosContrato ?? {}) as Record<string, unknown>;
      const fechaFinAdenda = typeof datos.fechaFinAdenda === "string"
        ? String(datos.fechaFinAdenda).slice(0, 10)
        : "";
      const fechaFinSnapshot = typeof datos.fechaFin === "string"
        ? String(datos.fechaFin).slice(0, 10)
        : "";
      const fechaFinAnterior = typeof datos.fechaFinAnterior === "string"
        ? String(datos.fechaFinAnterior).slice(0, 10)
        : adenda.tipo === "ADENDA" && fechaFinAdenda > fechaFinSnapshot
          ? fechaFinSnapshot
          : "";
      const esExtensionConPlazo =
        adenda.tipo === "ADENDA_EXTENSION" ||
        Boolean(fechaFinAdenda && fechaFinAnterior);
      if (!esExtensionConPlazo || !fechaFinAnterior) continue;
      const fechas = renovacionesPorContrato.get(adenda.contractId) ?? new Set<string>();
      fechas.add(fechaFinAnterior);
      renovacionesPorContrato.set(adenda.contractId, fechas);
    }

    const sucesoresConfirmados = new Set(
      firmas
        .filter((contrato) => contrato.renovadoDe)
        .map((contrato) => contrato.renovadoDe as string)
    );
    const expiraciones = new Map<string, boolean>();
    for (const contrato of firmas) {
      const fechasExtension = renovacionesPorContrato.get(contrato.id) ?? new Set<string>();
      for (const fecha of fechasExtension) {
        if (fecha < inicioVentanaRenovacionStr || fecha > hoyStr) continue;
        expiraciones.set(`${contrato.id}:${fecha}`, true);
      }

      const fechaFinReal = contrato.estado === "RESUELTO" && contrato.resueltoEn
        ? toDateStr(contrato.resueltoEn)
        : toDateStr(contrato.fechaFin);
      if (fechaFinReal < inicioVentanaRenovacionStr || fechaFinReal > hoyStr) continue;
      const renovado = fechasExtension.has(fechaFinReal) || sucesoresConfirmados.has(contrato.id);
      expiraciones.set(`${contrato.id}:${fechaFinReal}`, renovado);
    }
    const contratosVencidosPeriodo = expiraciones.size;
    const contratosRenovados = [...expiraciones.values()].filter(Boolean).length;
    const tasaRenovacion = contratosVencidosPeriodo
      ? Math.round((contratosRenovados / contratosVencidosPeriodo) * 100)
      : 0;

    const duracionContratos = [
      { label: "Menos de 3 meses", maxDias: 90, cantidad: 0 },
      { label: "3 a 6 meses", maxDias: 180, cantidad: 0 },
      { label: "6 a 12 meses", maxDias: 365, cantidad: 0 },
      { label: "1 a 2 años", maxDias: 730, cantidad: 0 },
      { label: "Más de 2 años", maxDias: Infinity, cantidad: 0 },
    ];
    const duracionesDias: number[] = [];
    const periodosPorDepartamento = new Map<
      string,
      { inicio: string; fin: string }[]
    >();
    for (const contrato of firmas) {
      const inicio = toDateStr(contrato.fechaInicio);
      const fin = contrato.estado === "RESUELTO" && contrato.resueltoEn
        ? toDateStr(contrato.resueltoEn)
        : toDateStr(contrato.fechaFin);
      if (inicio > hoyStr || fin < inicio) continue;
      const finMedicion = fin > hoyStr ? hoyStr : fin;
      const duracion = diffDays(inicio, fin) + 1;
      duracionesDias.push(duracion);
      const bucket = duracionContratos.find((item) => duracion <= item.maxDias);
      if (bucket) bucket.cantidad++;
      const periodos = periodosPorDepartamento.get(contrato.departamentoId) ?? [];
      periodos.push({ inicio, fin: finMedicion });
      periodosPorDepartamento.set(contrato.departamentoId, periodos);
    }
    const duracionMediaContratoDias = duracionesDias.length
      ? Math.round(duracionesDias.reduce((suma, dias) => suma + dias, 0) / duracionesDias.length)
      : null;

    const distribucionVacancia = [
      { label: "0 a 7 días", maxDias: 7, cantidad: 0 },
      { label: "8 a 30 días", maxDias: 30, cantidad: 0 },
      { label: "31 a 60 días", maxDias: 60, cantidad: 0 },
      { label: "Más de 60 días", maxDias: Infinity, cantidad: 0 },
    ];
    const vacanciasCerradas: number[] = [];
    const finMasRecientePorDepartamento = new Map<string, string>();
    for (const [departamentoId, periodos] of periodosPorDepartamento) {
      periodos.sort((a, b) => a.inicio.localeCompare(b.inicio));
      let ocupadoHasta: string | null = null;
      for (const periodo of periodos) {
        if (ocupadoHasta && periodo.inicio > ocupadoHasta) {
          const diasLibres = Math.max(0, diffDays(ocupadoHasta, periodo.inicio) - 1);
          vacanciasCerradas.push(diasLibres);
          const bucket = distribucionVacancia.find((item) => diasLibres <= item.maxDias);
          if (bucket) bucket.cantidad++;
        }
        if (!ocupadoHasta || periodo.fin > ocupadoHasta) ocupadoHasta = periodo.fin;
      }
      if (ocupadoHasta) finMasRecientePorDepartamento.set(departamentoId, ocupadoHasta);
    }
    const vacanciaMediaDias = vacanciasCerradas.length
      ? Math.round(vacanciasCerradas.reduce((suma, dias) => suma + dias, 0) / vacanciasCerradas.length)
      : null;

    const departamentosDisponibles = await db
      .select({
        id: schema.departments.id,
        estadoManual: schema.departments.estadoManual,
        activo: schema.departments.activo,
      })
      .from(schema.departments);
    const vacanciasActuales: number[] = [];
    for (const departamento of departamentosDisponibles) {
      if (!departamento.activo || departamento.estadoManual === "BLOQUEADO" || departamento.estadoManual === "MANTENIMIENTO") continue;
      const ultimoFin = finMasRecientePorDepartamento.get(departamento.id);
      if (!ultimoFin || ultimoFin >= hoyStr) continue;
      vacanciasActuales.push(Math.max(0, diffDays(ultimoFin, hoyStr)));
    }
    const vacanciaActualMediaDias = vacanciasActuales.length
      ? Math.round(vacanciasActuales.reduce((suma, dias) => suma + dias, 0) / vacanciasActuales.length)
      : null;

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

    const vencenHoy = await db
      .select({
        id: schema.payments.id,
        codigoContrato: schema.contracts.codigoContrato,
        cliente: sql<string>`trim(coalesce(${schema.clients.nombres}, '') || ' ' || coalesce(${schema.clients.apellidos}, ''))`,
        departamento: schema.departments.codigo,
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        periodo: schema.payments.periodo,
      })
      .from(schema.payments)
      .innerJoin(
        schema.contracts,
        eq(schema.contracts.id, schema.payments.contractId)
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
          eq(schema.payments.periodo, hoyStr),
          ne(schema.payments.estado, "PAGADO"),
          ne(schema.payments.estado, "CANCELADO")
        )
      )
      .orderBy(schema.contracts.codigoContrato);

    const pagosVencenHoy: PagoVenceHoy[] = vencenHoy.map((p) => ({
      id: p.id,
      codigoContrato: p.codigoContrato,
      cliente: p.cliente || "—",
      departamento: p.departamento ?? null,
      monto: Number(p.monto) + Number(p.mantenimiento),
      periodo: p.periodo,
    }));

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
      pagosVencenHoy,
      contratosRenovados,
      contratosVencidosPeriodo,
      tasaRenovacion,
      duracionMediaContratoDias,
      duracionContratos: duracionContratos.map(({ label, cantidad }) => ({ label, cantidad })),
      vacanciaMediaDias,
      vacanciasObservadas: vacanciasCerradas.length,
      distribucionVacancia: distribucionVacancia.map(({ label, cantidad }) => ({ label, cantidad })),
      vacanciaActualMediaDias,
      departamentosLibresConHistorial: vacanciasActuales.length,
    };
  }
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diffDays(from: string, to: string): number {
  const fromTime = new Date(`${from}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((toTime - fromTime) / 86_400_000);
}
