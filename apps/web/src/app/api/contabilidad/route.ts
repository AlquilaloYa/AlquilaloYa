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

interface PagoFila {
  periodo: string;
  monto: string | number;
  mantenimiento: string | number;
  montoPagado: string | number;
  estado: string;
  fechaPago: string | null;
  eliminadoEn: string | null;
}

function totalCuota(p: PagoFila): number {
  return Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0);
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
    const mesParam = url.searchParams.get("periodo") ?? "";
    const mes = /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : periodoActual();
    const startStr = `${mes}-01`;
    const endStr = inicioMesSiguiente(mes);

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

    const pagos: PagoFila[] = pagosRaw.map((p) => ({
      periodo: toDateStr(p.periodo),
      monto: p.monto,
      mantenimiento: p.mantenimiento,
      montoPagado: p.montoPagado,
      estado: p.estado,
      fechaPago: p.fechaPago ? toDateStr(p.fechaPago) : null,
      eliminadoEn: p.eliminadoEn ? toDateStr(p.eliminadoEn) : null,
    }));

    const materialesRaw = await db
      .select({
        totalCost: schema.workOrderMaterials.totalCost,
        createdAt: schema.workOrderMaterials.createdAt,
      })
      .from(schema.workOrderMaterials);
    const materiales = materialesRaw.map((m) => ({
      total: Number(m.totalCost ?? 0),
      fecha: toDateStr(m.createdAt),
    }));

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
    const ajustes = ajustesRaw.map((a) => ({
      id: a.id,
      periodo: toDateStr(a.periodo),
      estado: a.estado as Estado,
      grupo: a.grupo,
      etiqueta: a.etiqueta,
      monto: Number(a.monto ?? 0),
      nota: a.nota,
    }));

    const vigentes = pagos.filter((p) => !p.eliminadoEn);
    const ajustesDelMes = ajustes.filter((a) => a.periodo.slice(0, 7) === mes);
    const ajustesAcum = ajustes.filter((a) => a.periodo < endStr);
    const suma = (arr: { monto: number }[]) => arr.reduce((s, x) => s + x.monto, 0);

    // ---------- Estado de Resultados (devengado del mes) ----------
    const ingresosERP = vigentes
      .filter((p) => p.periodo.slice(0, 7) === mes)
      .reduce((s, p) => s + totalCuota(p), 0);
    const gastosERP = materiales
      .filter((m) => m.fecha.slice(0, 7) === mes)
      .reduce((s, m) => s + m.total, 0);

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

    // ---------- Estado de Flujo de Efectivo (caja del mes) ----------
    const cobrosMes = vigentes.filter(
      (p) => p.estado === "PAGADO" && p.fechaPago && p.fechaPago.slice(0, 7) === mes
    );
    const entradasERP = cobrosMes.reduce((s, p) => s + totalCuota(p), 0);
    const salidasERP = gastosERP;

    const cobrosAntes = vigentes.filter(
      (p) => p.estado === "PAGADO" && p.fechaPago && p.fechaPago < startStr
    );
    const materialesAntes = materiales.filter((m) => m.fecha < startStr);
    const flujoAntesERP =
      cobrosAntes.reduce((s, p) => s + totalCuota(p), 0) -
      materialesAntes.reduce((s, m) => s + m.total, 0);

    const ajEntradas = ajustesDelMes.filter(
      (a) => a.estado === "FLUJO" && a.grupo === "ENTRADA"
    );
    const ajSalidas = ajustesDelMes.filter(
      (a) => a.estado === "FLUJO" && a.grupo === "SALIDA"
    );
    const ajFlujoAntes = ajustesAcum.filter(
      (a) => a.estado === "FLUJO" && a.periodo < startStr
    );
    const flujoAntesAjustes =
      suma(ajFlujoAntes.filter((a) => a.grupo === "ENTRADA")) -
      suma(ajFlujoAntes.filter((a) => a.grupo === "SALIDA"));

    const entradas = entradasERP + suma(ajEntradas);
    const salidas = salidasERP + suma(ajSalidas);
    const saldoInicial = flujoAntesERP + flujoAntesAjustes;
    const flujo = {
      entradas,
      salidas,
      entradasERP,
      salidasERP,
      saldoInicial,
      neto: entradas - salidas,
      saldoFinal: saldoInicial + (entradas - salidas),
    };

    // ---------- Balance General (saldos al cierre del mes) ----------
    const caja = flujo.saldoFinal;
    const cuentasPorCobrar = vigentes
      .filter((p) => p.estado !== "PAGADO" && p.periodo < endStr)
      .reduce((s, p) => s + Math.max(0, totalCuota(p) - Number(p.montoPagado ?? 0)), 0);

    const ajActivos = ajustesAcum.filter(
      (a) => a.estado === "BALANCE" && a.grupo === "ACTIVO"
    );
    const ajPasivos = ajustesAcum.filter(
      (a) => a.estado === "BALANCE" && a.grupo === "PASIVO"
    );
    const ajCapital = ajustesAcum.filter(
      (a) => a.estado === "BALANCE" && a.grupo === "PATRIMONIO"
    );

    const ingresosAcum = vigentes
      .filter((p) => p.periodo < endStr)
      .reduce((s, p) => s + totalCuota(p), 0);
    const gastosAcum = materiales
      .filter((m) => m.fecha < endStr)
      .reduce((s, m) => s + m.total, 0);
    const resultadoAcumulado =
      ingresosAcum -
      gastosAcum +
      suma(ajustesAcum.filter((a) => a.estado === "RESULTADOS" && a.grupo === "INGRESO")) -
      suma(ajustesAcum.filter((a) => a.estado === "RESULTADOS" && a.grupo === "GASTO"));

    const otrosActivos = suma(ajActivos);
    const pasivos = suma(ajPasivos);
    const capital = suma(ajCapital);
    const totalActivo = caja + cuentasPorCobrar + otrosActivos;
    const totalPatrimonio = capital + resultadoAcumulado;
    const balance = {
      caja,
      cuentasPorCobrar,
      otrosActivos,
      totalActivo,
      pasivos,
      totalPasivo: pasivos,
      capital,
      resultadoAcumulado,
      totalPatrimonio,
      totalPasivoPatrimonio: pasivos + totalPatrimonio,
      diferencia: totalActivo - (pasivos + totalPatrimonio),
    };

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
