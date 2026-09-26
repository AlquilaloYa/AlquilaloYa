import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, queryClient, schema } from "@contract/db";
import { env } from "@contract/config/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(invalida)";
  }
}

export async function GET() {
  const t0 = Date.now();
  const out: Record<string, unknown> = {};
  try {
    out.pool = redact(env.DATABASE_URL);

    const tA = Date.now();
    const [row] = await db
      .select({ value: schema.users.email })
      .from(schema.users)
      .limit(1);
    out.msFindUser = Date.now() - tA;
    out.sampleEmail = row?.value ?? null;

    const q1 = () =>
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
        .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId));
    const q2 = () =>
      db
        .select({
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
          monto: schema.payments.monto,
          mantenimiento: schema.payments.mantenimiento,
          estado: schema.payments.estado,
          fechaPago: schema.payments.fechaPago,
        })
        .from(schema.payments);
    const q3 = () =>
      db
        .select({
          id: schema.departments.id,
          codigo: schema.departments.codigo,
          nombre: schema.departments.nombre,
          numero: schema.departments.numero,
          personaPago: schema.departments.personaPago,
          estadoManual: schema.departments.estadoManual,
        })
        .from(schema.departments);
    const q4 = () =>
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
        .where(inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"]));

    const sec = async (name: string, fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        const res = await fn();
        out[`ms_${name}`] = Date.now() - t;
        out[`n_${name}`] = Array.isArray(res) ? res.length : 1;
      } catch (e) {
        out[`ms_${name}`] = Date.now() - t;
        out[`err_${name}`] = (e as Error).message;
      }
    };

    const tB = Date.now();
    await Promise.all([
      sec("contratos", q1),
      sec("pagos", q2),
      sec("departamentos", q3),
      sec("ocupacion", q4),
    ]);
    out.msParallel4 = Date.now() - tB;

    const tC = Date.now();
    try {
      const [a, b, c, d] = await Promise.all([q1(), q2(), q3(), q4()]);
      out.msParallelR = Date.now() - tC;
      out.nPar = [a.length, b.length, c.length, d.length];
    } catch (e) {
      out.msParallelR = Date.now() - tC;
      out.errParallel = (e as Error).message;
    }

    out.msTotal = Date.now() - t0;
    out.poolPing = await queryClient`select 1 as ok`
      .then(() => "ok")
      .catch((e) => `err:${(e as Error).message}`);
    return NextResponse.json({ ...out, ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, parcial: out },
      { status: 500 }
    );
  }
}