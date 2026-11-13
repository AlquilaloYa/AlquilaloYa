import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Normaliza una fecha (Date o string) a "YYYY-MM-DD". */
function toDateStr(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : s || null;
}

/** Clave de mes "YYYY-MM" a partir de "YYYY-MM-DD". */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function partesDelMes(key: string): { y: number; m: number } | null {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!ys || !ms || Number.isNaN(y) || Number.isNaN(m)) return null;
  return { y, m };
}

function addMonths(key: string, n: number): string {
  const partes = partesDelMes(key);
  if (!partes) return key;
  const d = new Date(Date.UTC(partes.y, partes.m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(key: string): number {
  const partes = partesDelMes(key);
  if (!partes) return 30;
  return new Date(Date.UTC(partes.y, partes.m, 0)).getUTCDate();
}

/** Fecha de vencimiento del pago mensual: mismo día del mes, acotado al mes. */
function vencimientoDelMes(key: string, diaAncla: number): string {
  const day = Math.min(diaAncla, daysInMonth(key));
  return `${key}-${String(day).padStart(2, "0")}`;
}

/**
 * Genera (idempotente) las filas de pagos mensuales de cada servicio extra:
 * desde el mes de su fecha de pago (o fecha de opción) hasta el mes actual + 1,
 * sin pasar del mes de fin del contrato (ni del mes de resolución).
 */
async function asegurarPagos(
  db: typeof import("@contract/db").db,
  schema: typeof import("@contract/db").schema,
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const filas = await db
    .select({
      id: schema.serviciosExtras.id,
      fechaOpcion: schema.serviciosExtras.fechaOpcion,
      fechaPago: schema.serviciosExtras.fechaPago,
      contractEstado: schema.contracts.estado,
      contractFechaFin: schema.contracts.fechaFin,
      contractResueltoEn: schema.contracts.resueltoEn,
    })
    .from(schema.serviciosExtras)
    .leftJoin(schema.contracts, eq(schema.serviciosExtras.contractId, schema.contracts.id));
  if (filas.length === 0) return;

  const hoy = new Date();
  const mesActual = monthKey(hoy.toISOString().slice(0, 10));
  const mesSiguiente = addMonths(mesActual, 1);

  const valores: {
    servicioId: string;
    periodo: string;
    fechaVencimiento: string;
  }[] = [];
  for (const f of filas) {
    const ancla = toDateStr(f.fechaPago) ?? toDateStr(f.fechaOpcion);
    if (!ancla || ancla.length < 10) continue;
    const diaAncla = Number(ancla.slice(8, 10));
    if (!Number.isFinite(diaAncla) || diaAncla < 1) continue;

    let mesFin = mesSiguiente;
    const fechaFin = toDateStr(f.contractFechaFin);
    if (fechaFin && monthKey(fechaFin) < mesFin) mesFin = monthKey(fechaFin);
    if (
      f.contractEstado === "RESUELTO" &&
      f.contractResueltoEn instanceof Date &&
      monthKey(f.contractResueltoEn.toISOString().slice(0, 10)) < mesFin
    ) {
      mesFin = monthKey(f.contractResueltoEn.toISOString().slice(0, 10));
    }

    let mes = monthKey(ancla);
    while (mes <= mesFin) {
      valores.push({
        servicioId: f.id,
        periodo: mes,
        fechaVencimiento: vencimientoDelMes(mes, diaAncla),
      });
      mes = addMonths(mes, 1);
    }
  }
  if (valores.length === 0) return;

  await db
    .insert(schema.serviciosExtrasPagos)
    .values(valores)
    .onConflictDoNothing({
      target: [schema.serviciosExtrasPagos.servicioId, schema.serviciosExtrasPagos.periodo],
    });
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

    await asegurarPagos(db, schema);

    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: schema.serviciosExtrasPagos.id,
        servicioId: schema.serviciosExtrasPagos.servicioId,
        periodo: schema.serviciosExtrasPagos.periodo,
        fechaVencimiento: schema.serviciosExtrasPagos.fechaVencimiento,
        voucherFilename: schema.serviciosExtrasPagos.voucherFilename,
        voucherVerificadoEn: schema.serviciosExtrasPagos.voucherVerificadoEn,
        voucherVerificadoPor: schema.serviciosExtrasPagos.voucherVerificadoPor,
        contractId: schema.serviciosExtras.contractId,
        codigoContrato: schema.serviciosExtras.codigoContrato,
        tipoServicio: schema.serviciosExtras.tipoServicio,
        montoTotal: schema.serviciosExtras.montoTotal,
        clienteNombre: schema.serviciosExtras.clienteNombre,
        clienteDocumento: schema.serviciosExtras.clienteDocumento,
      })
      .from(schema.serviciosExtrasPagos)
      .innerJoin(
        schema.serviciosExtras,
        eq(schema.serviciosExtrasPagos.servicioId, schema.serviciosExtras.id),
      )
      .orderBy(schema.serviciosExtrasPagos.fechaVencimiento);

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        fechaVencimiento: toDateStr(r.fechaVencimiento) ?? String(r.fechaVencimiento),
      })),
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
