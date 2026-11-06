import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { clasificarSinOcupante, normalizarEstadoManual } from "@/lib/estado-departamento";
import { ESTADOS_CONTRATO_OCUPANTES } from "@/lib/estado-contrato";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { and, inArray, isNull } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.departments)
      .orderBy(schema.departments.nombre, schema.departments.numero);

    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);
    const ocupantes = await db
      .select({
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        clienteId: schema.contracts.clienteId,
        estado: schema.contracts.estado,
      })
      .from(schema.contracts)
      .where(
        and(
          inArray(schema.contracts.estado, ESTADOS_CONTRATO_OCUPANTES),
          isNull(schema.contracts.eliminadoEn)
        )
      );

    const contratoEstadoPorDepartamento = new Map<string, string>();
    const ultimoFinPorDepartamento = new Map<string, string>();
    const contratoVigentePorDepartamento = new Map<string, (typeof ocupantes)[number]>();
    const fechaFinOcupadaPorDepartamento = new Map<string, string>();
    const pesoEstado = (estado: string) =>
      estado === "NOTARIADO" ? 3 : estado === "FIRMADO" ? 2 : estado === "ACTIVO" || estado === "VIGENTE" ? 1 : 0;

    for (const contrato of ocupantes) {
      const estadoPrevio = contratoEstadoPorDepartamento.get(contrato.departamentoId);
      if (!estadoPrevio || pesoEstado(contrato.estado) >= pesoEstado(estadoPrevio)) {
        contratoEstadoPorDepartamento.set(contrato.departamentoId, contrato.estado);
      }

      const ultimoFin = ultimoFinPorDepartamento.get(contrato.departamentoId);
      if (!ultimoFin || contrato.fechaFin > ultimoFin) {
        ultimoFinPorDepartamento.set(contrato.departamentoId, contrato.fechaFin);
      }

      if (contrato.fechaInicio <= hoyISO && contrato.fechaFin >= hoyISO) {
        const vigente = contratoVigentePorDepartamento.get(contrato.departamentoId);
        if (!vigente || contrato.fechaInicio > vigente.fechaInicio) {
          contratoVigentePorDepartamento.set(contrato.departamentoId, contrato);
        }
        const finOcupada = fechaFinOcupadaPorDepartamento.get(contrato.departamentoId);
        if (!finOcupada || contrato.fechaFin > finOcupada) {
          fechaFinOcupadaPorDepartamento.set(contrato.departamentoId, contrato.fechaFin);
        }
      }
    }

    const clienteIds = [...new Set(ocupantes.map((c) => c.clienteId))];
    const clientes = clienteIds.length > 0
      ? await db
          .select({
            id: schema.clients.id,
            nombres: schema.clients.nombres,
            apellidos: schema.clients.apellidos,
            telefono: schema.clients.telefono,
          })
          .from(schema.clients)
          .where(
            and(inArray(schema.clients.id, clienteIds), isNull(schema.clients.eliminadoEn))
          )
      : [];
    const clientePorId = new Map(clientes.map((c) => [c.id, c]));

    function diasRestantes(fecha: string): number {
      return Math.max(0, Math.round((new Date(fecha).getTime() - hoy.getTime()) / 86_400_000));
    }

    const resultado = rows.map((d) => {
      const contratoEstado = contratoEstadoPorDepartamento.get(d.id) ?? null;
      const contratoVigente = contratoVigentePorDepartamento.get(d.id);
      if (!contratoVigente) {
        // Un contrato vigente manda siempre sobre el estado manual. Sin contrato
        // vigente se delega la clasificacion a la funcion pura: el estado manual
        // explicito (incluido DISPONIBLE) gana sobre el mantenimiento automatico
        // por contrato vencido.
        const { enMantenimiento, bloqueado } = clasificarSinOcupante({
          estadoManual: normalizarEstadoManual(d.estadoManual),
          ultimoFin: ultimoFinPorDepartamento.get(d.id) ?? null,
          hoy: hoyISO,
        });
        return { ...d, contratoEstado, disponibilidad: null, enMantenimiento, bloqueado };
      }
      const cliente = clientePorId.get(contratoVigente.clienteId);
      const fechaFin = fechaFinOcupadaPorDepartamento.get(d.id) ?? contratoVigente.fechaFin;
      return {
        ...d,
        contratoEstado,
        disponibilidad: {
          disponible: false,
          fechaFin,
          dias: diasRestantes(fechaFin),
        },
        enMantenimiento: false,
        bloqueado: false,
        ocupante: cliente
          ? {
              nombres: cliente.nombres,
              apellidos: cliente.apellidos ?? null,
              telefono: cliente.telefono ?? null,
            }
          : null,
      };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
