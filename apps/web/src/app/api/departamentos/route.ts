import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { inArray } = await import("drizzle-orm");
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
        inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"])
      );

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
          .where(inArray(schema.clients.id, clienteIds))
      : [];
    const clientePorId = new Map(clientes.map((c) => [c.id, c]));

    // Última fecha de término de cada departamento para detectar mantenimiento
    // (contrato terminado sin renovación por adenda → el depto pasa a mantenimiento).
    const ultimoFinPorDepartamento = new Map<string, string>();
    for (const c of ocupantes) {
      const prev = ultimoFinPorDepartamento.get(c.departamentoId);
      if (!prev || c.fechaFin > prev) {
        ultimoFinPorDepartamento.set(c.departamentoId, c.fechaFin);
      }
    }

    // Estado del contrato más reciente por departamento: si existe un contrato
    // firmado (aprobado) o notariado, el concepto de "vencido" deja de aplicar
    // en el temporizador de separación.
    const contratoEstadoPorDepartamento = new Map<string, string>();
    for (const c of ocupantes) {
      const prev = contratoEstadoPorDepartamento.get(c.departamentoId);
      const peso = (e: string) =>
        e === "NOTARIADO" ? 3 : e === "FIRMADO" ? 2 : e === "ACTIVO" ? 1 : e === "VIGENTE" ? 1 : 0;
      if (!prev || peso(c.estado) >= peso(prev)) {
        contratoEstadoPorDepartamento.set(c.departamentoId, c.estado);
      }
    }

    function diasRestantes(fecha: string): number {
      return Math.max(0, Math.round((new Date(fecha).getTime() - hoy.getTime()) / 86_400_000));
    }

    const resultado = rows.map((d) => {
      const contratoEstado = contratoEstadoPorDepartamento.get(d.id) ?? null;
      const ocupando = ocupantes
        .filter(
          (c) =>
            c.departamentoId === d.id &&
            c.fechaInicio <= hoyISO &&
            c.fechaFin >= hoyISO
        )
        .map((c) => c.fechaFin)
        .sort();
      if (ocupando.length === 0) {
        if (d.estadoManual === "BLOQUEADO") {
          return { ...d, contratoEstado, disponibilidad: null, enMantenimiento: false, bloqueado: true };
        }
        if (d.estadoManual === "MANTENIMIENTO") {
          return { ...d, contratoEstado, disponibilidad: null, enMantenimiento: true, bloqueado: false };
        }
        const ultimoFin = ultimoFinPorDepartamento.get(d.id);
        const enMantenimiento = Boolean(ultimoFin && ultimoFin < hoyISO);
        return { ...d, contratoEstado, disponibilidad: null, enMantenimiento, bloqueado: false };
      }
      const fin = ocupando[ocupando.length - 1] as string;
      const ocupanteIds = new Set(
        ocupantes.filter((c) => c.departamentoId === d.id).map((c) => c.clienteId)
      );
      const cliente = [...ocupanteIds].map((id) => clientePorId.get(id)).find(Boolean);
      return {
        ...d,
        contratoEstado,
        disponibilidad: { disponible: false, fechaFin: fin, dias: diasRestantes(fin) },
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
