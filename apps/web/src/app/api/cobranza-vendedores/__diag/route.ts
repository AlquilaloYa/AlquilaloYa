import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@contract/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    const [row] = await db
      .select({ value: schema.departments.codigo })
      .from(schema.departments)
      .limit(1);
    const t2 = Date.now();
    void row;

    return NextResponse.json({
      msQueries: t1 - t0,
      msSelect1: t2 - t1,
      nContratos: contratos.length,
      nPagos: pagos.length,
      nDepartamentos: departamentos.length,
      nOcupacion: contratosOcupacion.length,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}