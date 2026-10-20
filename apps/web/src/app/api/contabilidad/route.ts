import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ESTADOS = ["RESULTADOS", "FLUJO", "BALANCE"] as const;
const GRUPOS: Record<string, readonly string[]> = {
  RESULTADOS: ["INGRESO", "GASTO"],
  FLUJO: ["ENTRADA", "SALIDA"],
  BALANCE: ["ACTIVO", "PASIVO", "PATRIMONIO"],
};
type Estado = (typeof ESTADOS)[number];

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

function periodoActual(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/** Primer día del mes siguiente a `mes` (YYYY-MM), como YYYY-MM-DD. */
function inicioMesSiguiente(mes: string): string {
  const [y = 1970, m = 1] = mes.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Nombre de mes legible (0 = Enero). */
const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface PagoFila {
  periodo: string;
  monto: string | number;
  mantenimiento: string | number;
  montoPagado: string | number;
  estado: string;
  fechaPago: string | null;
  eliminadoEn: string | null;
}

interface MaterialFila {
  total: number;
  fecha: string;
}

interface AjusteFila {
  id: string;
  periodo: string;
  estado: string;
  grupo: string;
  etiqueta: string;
  monto: number;
  nota: string;
}

interface Base {
  pagos: PagoFila[];
  materiales: MaterialFila[];
  ajustes: AjusteFila[];
}

function totalCuota(p: PagoFila): number {
  return Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0);
}

/** Ingresos devengados del mes (cuotas del periodo, cualquiera sea su estado). */
function ingresosMes(b: Base, mes: string): number {
  return b.pagos
    .filter((p) => p.periodo.slice(0, 7) === mes)
    .reduce((s, p) => s + totalCuota(p), 0);
}

/** Gastos del mes: materiales de órdenes de trabajo. */
function gastosMes(b: Base, mes: string): number {
  return b.materiales
    .filter((m) => m.fecha.slice(0, 7) === mes)
    .reduce((s, m) => s + m.total, 0);
}

function entradasMes(b: Base, mes: string): number {
  return b.pagos
    .filter(
      (p) =>
        p.estado === "PAGADO" &&
        p.fechaPago &&
        p.fechaPago.slice(0, 7) === mes
    )
    .reduce((s, p) => s + totalCuota(p), 0);
}

function salidasMes(b: Base, mes: string): number {
  return gastosMes(b, mes);
}

function sumaAjustes(
  arr: AjusteFila[],
  estado: string,
  grupo: string
): number {
  return arr
    .filter((a) => a.estado === estado && a.grupo === grupo)
    .reduce((s, a) => s + a.monto, 0);
}

/** Caja acumulada a partir de `fecha` (cobrado menos salidas, siempre). */
function saldoAntesDe(b: Base, fecha: string): number {
  const cobrado = b.pagos
    .filter((p) => p.estado === "PAGADO" && p.fechaPago && p.fechaPago < fecha)
    .reduce((s, p) => s + totalCuota(p), 0);
  const salido = b.materiales
    .filter((m) => m.fecha < fecha)
    .reduce((s, m) => s + m.total, 0);
  const ajustes = b.ajustes.filter((a) => a.estado === "FLUJO" && a.periodo < fecha);
  const entradas =
    sumaAjustes(ajustes, "FLUJO", "ENTRADA") -
    sumaAjustes(ajustes, "FLUJO", "SALIDA");
  return cobrado - salido + entradas;
}

function flujoDeMes(b: Base, mes: string) {
  const entradas = entradasMes(b, mes);
  const salidas = salidasMes(b, mes);
  const saldoInicial = saldoAntesDe(b, `${mes}-01`);
  const neto = entradas - salidas;
  return { entradas, salidas, saldoInicial, neto, saldoFinal: saldoInicial + neto };
}

function resultadosDeMes(b: Base, mes: string) {
  const ingresos = ingresosMes(b, mes);
  const gastos = gastosMes(b, mes);
  return { ingresos, gastos, utilidad: ingresos - gastos };
}

/** Balance al cierre de `end` (primer día del mes siguiente). */
function balanceEn(b: Base, end: string, caja: number) {
  const cuentasPorCobrar = b.pagos
    .filter((p) => p.estado !== "PAGADO" && p.periodo < end)
    .reduce((s, p) => s + Math.max(0, totalCuota(p) - Number(p.montoPagado ?? 0)), 0);

  const ajustes = b.ajustes.filter((a) => a.periodo < end);
  const otrosActivos = sumaAjustes(ajustes, "BALANCE", "ACTIVO");
  const pasivos = sumaAjustes(ajustes, "BALANCE", "PASIVO");
  const capital = sumaAjustes(ajustes, "BALANCE", "PATRIMONIO");

  const ingresosAcum = b.pagos
    .filter((p) => p.periodo < end)
    .reduce((s, p) => s + totalCuota(p), 0);
  const gastosAcum = b.materiales
    .filter((m) => m.fecha < end)
    .reduce((s, m) => s + m.total, 0);
  const resultadoAcumulado =
    ingresosAcum -
    gastosAcum +
    sumaAjustes(
      ajustes.filter((a) => a.estado === "RESULTADOS"),
      "RESULTADOS",
      "INGRESO"
    ) -
    sumaAjustes(
      ajustes.filter((a) => a.estado === "RESULTADOS"),
      "RESULTADOS",
      "GASTO"
    );

  const totalActivo = caja + cuentasPorCobrar + otrosActivos;
  const totalPatrimonio = capital + resultadoAcumulado;
  const totalPasivoPatrimonio = pasivos + totalPatrimonio;

  return {
    caja,
    cuentasPorCobrar,
    otrosActivos,
    totalActivo,
    pasivos,
    totalPasivo: pasivos,
    capital,
    resultadoAcumulado,
    totalPatrimonio,
    totalPasivoPatrimonio,
    diferencia: totalActivo - totalPasivoPatrimonio,
  };
}

/** Desglose anual: los 12 meses, los totales y el balance al cierre. */
function analiticaAnual(b: Base, anio: number) {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const resultados = resultadosDeMes(b, mes);
    const flujo = flujoDeMes(b, mes);
    return {
      mes,
      indice: i + 1,
      etiqueta: NOMBRES_MES[i] ?? String(i + 1),
      ...resultados,
      entradas: flujo.entradas,
      salidas: flujo.salidas,
      neto: flujo.neto,
      saldoCaja: flujo.saldoFinal,
    };
  });

  const totales = {
    ingresos: meses.reduce((s, m) => s + m.ingresos, 0),
    gastos: meses.reduce((s, m) => s + m.gastos, 0),
    utilidad: meses.reduce((s, m) => s + m.utilidad, 0),
    entradas: meses.reduce((s, m) => s + m.entradas, 0),
    salidas: meses.reduce((s, m) => s + m.salidas, 0),
    neto: meses.reduce((s, m) => s + m.neto, 0),
    saldoFinal: meses[11]?.saldoCaja ?? 0,
  };

  const cierre = balanceEn(b, inicioMesSiguiente(`${anio}-12`), totales.saldoFinal);
  return { anio, meses, totales, cierre };
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const url = new URL(req.url);
    const anioParam = url.searchParams.get("anio") ?? "";
    const mesParam = url.searchParams.get("periodo") ?? "";
    const esAnual = /^\d{4}$/.test(anioParam);
    const mes = esAnual
      ? ""
      : /^\d{4}-\d{2}$/.test(mesParam)
        ? mesParam
        : periodoActual();

    const pagosRaw = await db
      .select({
        periodo: schema.payments.periodo,
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        montoPagado: schema.payments.montoPagado,
        estado: schema.payments.estado,
        fechaPago: schema.payments.fechaPago,
        eliminadoEn: schema.payments.eliminadoEn,
      })
      .from(schema.payments);

    const materialesRaw = await db
      .select({
        totalCost: schema.workOrderMaterials.totalCost,
        createdAt: schema.workOrderMaterials.createdAt,
      })
      .from(schema.workOrderMaterials);

    const ajustesRaw = await db
      .select({
        id: schema.accountingEntries.id,
        periodo: schema.accountingEntries.periodo,
        estado: schema.accountingEntries.estado,
        grupo: schema.accountingEntries.grupo,
        etiqueta: schema.accountingEntries.etiqueta,
        monto: schema.accountingEntries.monto,
        nota: schema.accountingEntries.nota,
      })
      .from(schema.accountingEntries);

    const base: Base = {
      pagos: pagosRaw
        .map((p) => ({
          periodo: toDateStr(p.periodo),
          monto: p.monto,
          mantenimiento: p.mantenimiento,
          montoPagado: p.montoPagado,
          estado: p.estado,
          fechaPago: p.fechaPago ? toDateStr(p.fechaPago) : null,
          eliminadoEn: p.eliminadoEn ? toDateStr(p.eliminadoEn) : null,
        }))
        .filter((p) => !p.eliminadoEn),
      materiales: materialesRaw.map((m) => ({
        total: Number(m.totalCost ?? 0),
        fecha: toDateStr(m.createdAt),
      })),
      ajustes: ajustesRaw.map((a) => ({
        id: a.id,
        periodo: toDateStr(a.periodo),
        estado: a.estado,
        grupo: a.grupo,
        etiqueta: a.etiqueta,
        monto: Number(a.monto ?? 0),
        nota: a.nota,
      })),
    };

    // ---------- Modo anual: análisis del año contable completo ----------
    if (esAnual) {
      const anio = Number(anioParam);
      const actual = analiticaAnual(base, anio);
      const anterior = analiticaAnual(base, anio - 1);
      return NextResponse.json({
        anio,
        meses: actual.meses,
        totales: actual.totales,
        cierre: actual.cierre,
        previo: {
          anio: anio - 1,
          totales: anterior.totales,
          cierre: anterior.cierre,
        },
      });
    }

    // ---------- Modo mensual: un solo periodo ----------
    const startStr = `${mes}-01`;
    const endStr = inicioMesSiguiente(mes);
    const ajustesDelMes = base.ajustes.filter((a) => a.periodo.slice(0, 7) === mes);
    const suma = (arr: { monto: number }[]) => arr.reduce((s, x) => s + x.monto, 0);

    const ingresosERP = ingresosMes(base, mes);
    const gastosERP = gastosMes(base, mes);
    const ajIngresos = ajustesDelMes.filter(
      (a) => a.estado === "RESULTADOS" && a.grupo === "INGRESO"
    );
    const ajGastos = ajustesDelMes.filter(
      (a) => a.estado === "RESULTADOS" && a.grupo === "GASTO"
    );
    const resultados = {
      ingresos: ingresosERP + suma(ajIngresos),
      gastos: gastosERP + suma(ajGastos),
      ingresosERP,
      gastosERP,
    };

    const entradasERP = entradasMes(base, mes);
    const salidasERP = salidasMes(base, mes);
    const ajEntradas = ajustesDelMes.filter(
      (a) => a.estado === "FLUJO" && a.grupo === "ENTRADA"
    );
    const ajSalidas = ajustesDelMes.filter(
      (a) => a.estado === "FLUJO" && a.grupo === "SALIDA"
    );
    const saldoInicial = saldoAntesDe(base, startStr);

    const entradas = entradasERP + suma(ajEntradas);
    const salidas = salidasERP + suma(ajSalidas);
    const flujo = {
      entradas,
      salidas,
      entradasERP,
      salidasERP,
      saldoInicial,
      neto: entradas - salidas,
      saldoFinal: saldoInicial + (entradas - salidas),
    };

    const balance = balanceEn(base, endStr, flujo.saldoFinal);

    return NextResponse.json({
      periodo: mes,
      resultados,
      flujo,
      balance,
      ajustes: ajustesDelMes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await req.json()) as {
      periodo?: string;
      estado?: string;
      grupo?: string;
      etiqueta?: string;
      monto?: number | string;
      nota?: string;
    };

    const mes = /^\d{4}-\d{2}$/.test(body.periodo ?? "")
      ? (body.periodo as string)
      : periodoActual();
    const estado = body.estado as Estado;
    if (!ESTADOS.includes(estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const grupo = (body.grupo ?? "").toUpperCase();
    const gruposValidos = GRUPOS[estado];
    if (!gruposValidos || !gruposValidos.includes(grupo)) {
      return NextResponse.json(
        { error: `Grupo inválido para ${estado}` },
        { status: 400 }
      );
    }
    const etiqueta = (body.etiqueta ?? "").trim();
    if (!etiqueta) {
      return NextResponse.json({ error: "La etiqueta es obligatoria" }, { status: 400 });
    }
    const monto = Number(body.monto ?? 0);
    if (!Number.isFinite(monto) || monto < 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const [row] = await db
      .insert(schema.accountingEntries)
      .values({
        periodo: `${mes}-01`,
        estado,
        grupo,
        etiqueta,
        monto: monto.toFixed(2),
        nota: (body.nota ?? "").trim(),
        creadoPor: auth.user.name,
      })
      .returning();

    if (!row) {
      return NextResponse.json({ error: "No se pudo guardar el ajuste" }, { status: 500 });
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await req.json()) as {
      id?: string;
      etiqueta?: string;
      monto?: number | string;
      nota?: string;
    };
    if (!body.id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.etiqueta === "string" && body.etiqueta.trim()) {
      values.etiqueta = body.etiqueta.trim();
    }
    if (body.monto !== undefined) {
      const monto = Number(body.monto);
      if (!Number.isFinite(monto) || monto < 0) {
        return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
      }
      values.monto = monto.toFixed(2);
    }
    if (typeof body.nota === "string") values.nota = body.nota.trim();

    const [row] = await db
      .update(schema.accountingEntries)
      .set(values)
      .where(eq(schema.accountingEntries.id, body.id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Ajuste no encontrado" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.accountingEntries).where(eq(schema.accountingEntries.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
