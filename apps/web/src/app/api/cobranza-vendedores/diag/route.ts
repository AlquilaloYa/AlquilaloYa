import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@contract/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

export async function GET() {
  const t0 = Date.now();
  try {
    const [contratos, pagos, departamentos, contratosOcupacion] = await Promise.all([
      db
        .select({
          id: schema.contracts.id,
          codigoContrato: schema.contracts.codigoContrato,
          clienteNombre: schema.clients.nombres,
          clienteApellido: schema.clients.apellidos,
          departamentoCodigo: schema.departments.codigo,
          personaPago: schema.departments.personaPago,
          estado: schema.contracts.estado,
          montoCanonMensual: schema.contracts.montoCanonMensual,
          mantenimiento: schema.contracts.mantenimiento,
          fechaInicio: schema.contracts.fechaInicio,
          fechaFin: schema.contracts.fechaFin,
        })
        .from(schema.contracts)
        .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
        .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId)),
      db
        .select({
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
          monto: schema.payments.monto,
          mantenimiento: schema.payments.mantenimiento,
          estado: schema.payments.estado,
          fechaPago: schema.payments.fechaPago,
        })
        .from(schema.payments),
      db
        .select({
          id: schema.departments.id,
          codigo: schema.departments.codigo,
          nombre: schema.departments.nombre,
          numero: schema.departments.numero,
          personaPago: schema.departments.personaPago,
          estadoManual: schema.departments.estadoManual,
        })
        .from(schema.departments),
      db
        .select({
          id: schema.contracts.id,
          codigoContrato: schema.contracts.codigoContrato,
          departamentoId: schema.contracts.departamentoId,
          personaPago: schema.departments.personaPago,
          fechaInicio: schema.contracts.fechaInicio,
          fechaFin: schema.contracts.fechaFin,
          estado: schema.contracts.estado,
          clienteNombre: schema.clients.nombres,
          clienteApellido: schema.clients.apellidos,
        })
        .from(schema.contracts)
        .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
        .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId))
        .where(inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"])),
    ]);
    const t1 = Date.now();

    const hoy = new Date();
    const mesStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    let totalGenerado = 0;
    for (const p of pagos) {
      if (p.estado === "PAGADO" && toDateStr(p.periodo).slice(0, 7) === mesStr) {
        totalGenerado += Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0);
      }
    }
    let contratosBucket = 0;
    for (const c of contratos) {
      const pagosDe = pagos.filter((p) => p.contractId === c.id);
      const montoPagado = pagosDe
        .filter((p) => p.estado === "PAGADO" && toDateStr(p.periodo).slice(0, 7) === mesStr)
        .reduce((s, p) => s + Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0), 0);
      contratosBucket += montoPagado + Number(c.montoCanonMensual ?? 0) + Number(c.mantenimiento ?? 50);
    }
    const hoyStr = toDateStr(hoy);
    let deptosBucket = 0;
    for (const d of departamentos) {
      const ocupado = contratosOcupacion.some(
        (c) =>
          c.departamentoId === d.id &&
          toDateStr(c.fechaInicio) <= hoyStr &&
          (c.fechaFin ?? "") >= hoyStr
      );
      if (ocupado) deptosBucket += 1;
    }
    const t2 = Date.now();

    return NextResponse.json({
      msQueries: t1 - t0,
      msRender: t2 - t1,
      nContratos: contratos.length,
      nPagos: pagos.length,
      nDepartamentos: departamentos.length,
      nOcupacion: contratosOcupacion.length,
      totalGenerado,
      contratosBucket,
      deptosBucket,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}