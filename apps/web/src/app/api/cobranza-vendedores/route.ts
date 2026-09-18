import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

export const dynamic = "force-dynamic";

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

interface BucketPersona {
  key: string;
  nombre: string;
  generado: number;
  porCobrar: number;
  porcentaje: number;
  contratos: ContratoVendedor[];
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const [contratos, pagos] = await Promise.all([
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
        })
        .from(schema.payments),
    ]);

    const hoy = new Date();
    const inicioDia = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate()
    ).getTime();

    const mapa = new Map<string, BucketPersona>();
    for (const k of PERSONAS) {
      mapa.set(k, {
        key: k,
        nombre: NOMBRES[k] ?? k,
        generado: 0,
        porCobrar: 0,
        porcentaje: 0,
        contratos: [],
      });
    }

    let totalGenerado = 0;
    for (const p of pagos) {
      if (p.estado === "PAGADO") {
        totalGenerado += Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0);
      }
    }

    for (const c of contratos) {
      const persona = normalizarPersona(c.personaPago ?? "");
      if (!persona) continue;
      const bucket = mapa.get(persona)!;

      const pagosDe = pagos.filter((p) => p.contractId === c.id);
      const montoPagado = pagosDe
        .filter((p) => p.estado === "PAGADO")
        .reduce(
          (s, p) => s + Number(p.monto ?? 0) + Number(p.mantenimiento ?? 0),
          0
        );
      bucket.generado += montoPagado;

      const cancelado =
        c.estado === "CANCELADO" || c.estado === "RESUELTO";
      const montoCuota =
        Number(c.montoCanonMensual ?? 0) + Number(c.mantenimiento ?? 50);
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
          const pagoCuota = pagosDe.find((p) => toDateStr(p.periodo) === pStr);
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