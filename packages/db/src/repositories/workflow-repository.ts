import { eq } from "drizzle-orm";
import { db, schema } from "../index";
import {
  WorkflowQueue,
  type WorkflowBoard,
  type WorkflowRepository,
  type WorkflowTask,
} from "@contract/domain";

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function clienteNombre(nombres: string | null, apellidos: string | null): string {
  return [nombres, apellidos].filter(Boolean).join(" ").trim() || "Sin cliente";
}

export class DrizzleWorkflowRepository implements WorkflowRepository {
  async listBoard(): Promise<WorkflowBoard> {
    const hoy = new Date();
    const hoyStr = toDateStr(hoy);
    const finProximo = new Date(hoy);
    finProximo.setDate(hoy.getDate() + 30);
    const finProximoStr = toDateStr(finProximo);

    const rows = await db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        estado: schema.contracts.estado,
        fechaFin: schema.contracts.fechaFin,
        actualizadoEn: schema.contracts.actualizadoEn,
        clienteNombres: schema.clients.nombres,
        clienteApellidos: schema.clients.apellidos,
        departamentoNombre: schema.departments.nombre,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId)
      );

    const pendienteEmision: WorkflowTask[] = [];
    const emitido: WorkflowTask[] = [];
    const pendienteFirma: WorkflowTask[] = [];
    const porVencer: WorkflowTask[] = [];

    for (const r of rows) {
      const base = {
        id: r.id,
        contractId: r.id,
        codigoContrato: r.codigoContrato,
        clienteNombre: clienteNombre(r.clienteNombres, r.clienteApellidos),
        departamentoNombre: r.departamentoNombre ?? "Sin unidad",
        estado: r.estado as WorkflowTask["estado"],
        fechaFin: r.fechaFin,
        updatedAt: r.actualizadoEn.toISOString(),
      };

      if (r.estado === "PENDIENTE_EMISION") {
        pendienteEmision.push({ ...base, queue: WorkflowQueue.PENDIENTE_EMISION });
      } else if (r.estado === "EMITIDO") {
        emitido.push({ ...base, queue: WorkflowQueue.EMITIDO });
      } else if (r.estado === "PENDIENTE_FIRMA") {
        pendienteFirma.push({ ...base, queue: WorkflowQueue.PENDIENTE_FIRMA });
      } else if (
        r.estado === "FIRMADO" &&
        r.fechaFin &&
        r.fechaFin >= hoyStr &&
        r.fechaFin <= finProximoStr
      ) {
        porVencer.push({ ...base, queue: WorkflowQueue.POR_VENCER });
      }
    }

    const byDate = (a: WorkflowTask, b: WorkflowTask) =>
      a.updatedAt < b.updatedAt ? 1 : -1;

    return {
      pendienteEmision: pendienteEmision.sort(byDate),
      emitido: emitido.sort(byDate),
      pendienteFirma: pendienteFirma.sort(byDate),
      porVencer: porVencer.sort((a, b) =>
        (a.fechaFin ?? "").localeCompare(b.fechaFin ?? "")
      ),
    };
  }
}
