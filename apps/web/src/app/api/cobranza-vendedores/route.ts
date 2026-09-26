import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { db, schema, DrizzleUserRepository } from "@contract/db";
import { requireUser, requirePermission } from "@/lib/session";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PERSONAS = ["miguel", "emely", "evelin"] as const;
const NOMBRES: Record<string, string> = {
  miguel: "Miguel",
  emely: "Emely",
  evelin: "Evelyn",
};

function normalizarPersona(p: string): string | null {
  const v = p.trim().toLowerCase();
  if (v.startsWith("miguel")) return "miguel";
  if (v.startsWith("emely")) return "emely";
  if (v.startsWith("evelin") || v.startsWith("evelyn")) return "evelin";
  return null;
}

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

interface ContratoVendedor {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  clienteApellido: string;
  departamento: string | null;
  estado: string;
  montoCuota: number;
  montoPagado: number;
}

interface DepartamentoAsignado {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  estadoManual: string | null;
  ocupado: boolean;
  cliente: string;
  codigoContrato: string | null;
  fechaFin: string | null;
}

interface BucketPersona {
  key: string;
  nombre: string;
  generado: number;
  porCobrar: number;
  porcentaje: number;
  contratos: ContratoVendedor[];
  departamentos: DepartamentoAsignado[];
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser({ DrizzleUserRepository }, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

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
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId)
        )
        .leftJoin(
          schema.departments,
          eq(schema.departments.id, schema.contracts.departamentoId)
        ),
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
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId)
        )
        .leftJoin(
          schema.departments,
          eq(schema.departments.id, schema.contracts.departamentoId)
        )
        .where(
          inArray(schema.contracts.estado, [
            "FIRMADO",
            "ACTIVO",
            "VIGENTE",
            "NOTARIADO",
          ])
        ),
    ]);

    const hoy = new Date();
    const inicioDia = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate()
    ).getTime();
    const mesStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

    const pagoEsCuotaDelMes = (p: (typeof pagos)[number]): boolean =>
      toDateStr(p.periodo).slice(0, 7) === mesStr;

    const mapa = new Map<string, BucketPersona>();
    for (const k of PERSONAS) {
      mapa.set(k, {
        key: k,
        nombre: NOMBRES[k] ?? k,
        generado: 0,
        porCobrar: 0,
        porcentaje: 0,
        contratos: [],
        departamentos: [],
      });
    }

    let totalGenerado = 0;
    for (const p of pagos) {
      if (p.estado === "PAGADO" && pagoEsCuotaDelMes(p)) {
        totalGenerado += Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0);
      }
    }

    for (const c of contratos) {
      const persona = normalizarPersona(c.personaPago ?? "");
      if (!persona) continue;
      const bucket = mapa.get(persona)!;

      const pagosDe = pagos.filter((p) => p.contractId === c.id);
      const montoPagado = pagosDe
        .filter((p) => p.estado === "PAGADO" && pagoEsCuotaDelMes(p))
        .reduce(
          (s, p) => s + Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0),
          0
        );
      const montoCuota =
        Number(c.montoCanonMensual ?? 0) + Number(c.mantenimiento ?? 50);
      const cancelado =
        c.estado === "CANCELADO" || c.estado === "RESUELTO";
      let estadoCuota = "FINALIZADO";
      let pendiente = 0;

      if (!cancelado) {
        const ini = parseLocalDate(toDateStr(c.fechaInicio));
        const fin = parseLocalDate(toDateStr(c.fechaFin));
        const k =
          (hoy.getFullYear() - ini.getFullYear()) * 12 +
          (hoy.getMonth() - ini.getMonth());
        const cuota = addMonths(ini, k);
        if (cuota.getTime() < fin.getTime()) {
          const pStr = localDateStr(cuota);
          const pagoCuota = pagosDe.find(
            (p) => toDateStr(p.periodo) === pStr
          );
          const pagado = pagoCuota?.estado === "PAGADO";
          if (pagado) {
            estadoCuota = "PAGADO";
          } else if (cuota.getTime() < inicioDia) {
            estadoCuota = "VENCIDO";
            pendiente = montoCuota;
          } else {
            estadoCuota = "PENDIENTE";
            pendiente = montoCuota;
          }
          bucket.porCobrar += pendiente;
          if (pagado) bucket.generado += montoCuota;
        }
      }

      if (estadoCuota !== "FINALIZADO" && !cancelado) {
        bucket.contratos.push({
          id: c.id,
          codigoContrato: c.codigoContrato,
          clienteNombre: c.clienteNombre ?? "",
          clienteApellido: c.clienteApellido ?? "",
          departamento: c.departamentoCodigo ?? null,
          estado: estadoCuota,
          montoCuota,
          montoPagado,
        });
      }
    }

    const hoyStr = localDateStr(hoy);
    for (const d of departamentos) {
      const persona = normalizarPersona(d.personaPago ?? "");
      if (!persona) continue;
      const bucket = mapa.get(persona)!;
      const ocupado = contratosOcupacion.some(
        (c) =>
          c.departamentoId === d.id &&
          toDateStr(c.fechaInicio) <= hoyStr &&
          (c.fechaFin ?? "") >= hoyStr
      );
      const ocupante = contratosOcupacion.find(
        (c) => c.departamentoId === d.id &&
          toDateStr(c.fechaInicio) <= hoyStr &&
          (c.fechaFin ?? "") >= hoyStr
      );
      bucket.departamentos.push({
        id: d.id,
        codigo: d.codigo,
        nombre: d.nombre,
        numero: d.numero,
        estadoManual: d.estadoManual ?? null,
        ocupado,
        cliente:
          ocupante
            ? [ocupante.clienteNombre, ocupante.clienteApellido]
                .filter(Boolean)
                .join(" ")
            : "",
        codigoContrato: ocupante?.codigoContrato ?? null,
        fechaFin: ocupante?.fechaFin ?? null,
      });
    }

    for (const b of mapa.values()) {
      b.departamentos.sort((a, z) => a.codigo.localeCompare(z.codigo));
    }

    const vendedores = PERSONAS.map((k) => {
      const b = mapa.get(k)!;
      b.porcentaje =
        totalGenerado > 0 ? Math.round((b.generado / totalGenerado) * 100) : 0;
      return b;
    });

    return NextResponse.json({ vendedores, totalGenerado });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}