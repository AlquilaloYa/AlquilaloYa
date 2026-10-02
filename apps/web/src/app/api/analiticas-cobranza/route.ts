import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { db, schema, DrizzleUserRepository } from "@contract/db";
import { requireUser, requirePermission } from "@/lib/session";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

export const dynamic = "force-dynamic";

const PERSONAS = ["miguel", "emely", "evelin"] as const;
const NOMBRES: Record<(typeof PERSONAS)[number], string> = {
  miguel: "Miguel",
  emely: "Emely",
  evelin: "Evelyn",
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function normalizarPersona(persona: string | null): (typeof PERSONAS)[number] | null {
  const valor = (persona ?? "").trim().toLowerCase();
  if (valor.startsWith("miguel")) return "miguel";
  if (valor.startsWith("emely")) return "emely";
  if (valor.startsWith("evelin") || valor.startsWith("evelyn")) return "evelin";
  return null;
}

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function redondear(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser({ DrizzleUserRepository }, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const requestedYear = Number(new URL(req.url).searchParams.get("year"));
    const currentYear = new Date().getFullYear();
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear
      ? requestedYear
      : currentYear;
    const hoy = localDateStr(new Date());

    const contratos = await db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        clienteId: schema.clients.id,
        clienteNombre: schema.clients.nombres,
        clienteApellido: schema.clients.apellidos,
        departamento: schema.departments.codigo,
        personaPago: schema.departments.personaPago,
        estadoContrato: schema.contracts.estado,
        montoCanonMensual: schema.contracts.montoCanonMensual,
        mantenimientoContrato: schema.contracts.mantenimiento,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId));

    const pagos = await db
      .select({
        contractId: schema.payments.contractId,
        periodo: schema.payments.periodo,
        fechaPago: schema.payments.fechaPago,
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        estadoPago: schema.payments.estado,
        codigoContrato: schema.contracts.codigoContrato,
        personaPago: schema.departments.personaPago,
      })
      .from(schema.payments)
      .innerJoin(schema.contracts, eq(schema.contracts.id, schema.payments.contractId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId));

    const meses = MESES.map((mes) => ({
      mes,
      valores: { miguel: 0, emely: 0, evelin: 0 },
    }));
    const pagosPorContrato = new Map<string, Map<string, (typeof pagos)[number]>>();
    for (const pago of pagos) {
      const periodo = toDateStr(pago.periodo);
      const porPeriodo = pagosPorContrato.get(pago.contractId) ?? new Map();
      porPeriodo.set(periodo, pago);
      pagosPorContrato.set(pago.contractId, porPeriodo);
    }

    const deudas = new Map<
      string,
      Map<string, {
        clienteId: string;
        cliente: string;
        contratos: Map<string, { codigoContrato: string; departamento: string | null; periodos: string[]; total: number }>;
      }>
    >();

    for (const pago of pagos) {
      const persona = normalizarPersona(pago.personaPago);
      if (!persona) continue;

      if (pago.estadoPago === "PAGADO") {
        const fecha = toDateStr(pago.fechaPago ?? pago.periodo);
        if (Number(fecha.slice(0, 4)) === year) {
          const indice = Number(fecha.slice(5, 7)) - 1;
          if (indice >= 0 && indice < 12) {
            const mes = meses[indice];
            if (mes) mes.valores[persona] += Number(pago.monto ?? 0) + Number(pago.mantenimiento ?? 0);
          }
        }
      }

    }

    for (const contrato of contratos) {
      const persona = normalizarPersona(contrato.personaPago);
      if (!persona || contrato.estadoContrato === "CANCELADO" || contrato.estadoContrato === "RESUELTO") continue;

      const fechaInicio = parseLocalDate(toDateStr(contrato.fechaInicio));
      const fechaFin = parseLocalDate(toDateStr(contrato.fechaFin));
      const pagosDelContrato = pagosPorContrato.get(contrato.id);
      const montoBase = Number(contrato.montoCanonMensual ?? 0) + Number(contrato.mantenimientoContrato ?? 50);
      const personaDeudas = deudas.get(persona) ?? new Map();
      let cliente: {
        clienteId: string;
        cliente: string;
        contratos: Map<string, { codigoContrato: string; departamento: string | null; periodos: string[]; total: number }>;
      } | undefined;
      let deudaContrato: { codigoContrato: string; departamento: string | null; periodos: string[]; total: number } | undefined;

      for (let indice = 0; indice < 120; indice++) {
        const fechaCuota = addMonths(fechaInicio, indice);
        if (fechaCuota.getTime() >= fechaFin.getTime()) break;
        const periodo = localDateStr(fechaCuota);
        if (periodo > hoy) break;

        const pago = pagosDelContrato?.get(periodo);
        if (pago?.estadoPago === "PAGADO" || pago?.estadoPago === "CANCELADO") continue;

        cliente ??= personaDeudas.get(contrato.clienteId) ?? {
          clienteId: contrato.clienteId,
          cliente: [contrato.clienteNombre, contrato.clienteApellido].filter(Boolean).join(" "),
          contratos: new Map(),
        };
        if (!cliente) continue;
        deudaContrato ??= cliente.contratos.get(contrato.codigoContrato) ?? {
          codigoContrato: contrato.codigoContrato,
          departamento: contrato.departamento,
          periodos: [],
          total: 0,
        };
        deudaContrato.periodos.push(periodo);
        deudaContrato.total += pago
          ? Number(pago.monto ?? 0) + Number(pago.mantenimiento ?? 0)
          : montoBase;
      }

      if (cliente && deudaContrato) {
        cliente.contratos.set(contrato.codigoContrato, deudaContrato);
        personaDeudas.set(contrato.clienteId, cliente);
        deudas.set(persona, personaDeudas);
      }
    }

    const vendedores = PERSONAS.map((key) => {
      const clientes = [...(deudas.get(key)?.values() ?? [])]
        .map((cliente) => {
          const contratos = [...cliente.contratos.values()]
            .map((contrato) => ({
              ...contrato,
              periodos: contrato.periodos.sort(),
              total: redondear(contrato.total),
            }))
            .sort((a, b) => b.total - a.total);
          return {
            ...cliente,
            contratos,
            total: redondear(contratos.reduce((suma, contrato) => suma + contrato.total, 0)),
          };
        })
        .sort((a, b) => b.total - a.total);
      return { key, nombre: NOMBRES[key], clientes };
    });

    return NextResponse.json({
      year,
      meses: meses.map(({ mes, valores }) => ({
        mes,
        miguel: redondear(valores.miguel),
          emely: redondear(valores.emely),
          evelin: redondear(valores.evelin),
      })),
      vendedores,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}