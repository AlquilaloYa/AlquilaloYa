import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../index";
import {
  computeTenantScore,
  type IncidentInput,
  type PaymentInput,
  type ScoringResult,
} from "@contract/domain/scoring";

export interface TenantScoreRow {
  clienteId: string;
  nombres: string;
  apellidos: string | null;
  documentoIdentidad: string;
  telefono: string | null;
  contratosActivos: number;
  score: number;
  band: ScoringResult["band"];
  breakdown: ScoringResult["breakdown"];
}

export interface TenantIncident {
  id: string;
  clienteId: string;
  tipo: string;
  severidad: string;
  descripcion: string;
  departamentoCodigo: string | null;
  creadoPor: string | null;
  createdAt: string;
}

const DIAS_MS = 86_400_000;

function toDayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / DIAS_MS);
}

function todayDayNumber(): number {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(utc / DIAS_MS);
}

export interface ReportedClient {
  clienteId: string;
  nombre: string;
  documentoIdentidad: string;
  telefono: string | null;
  totalReportes: number;
  reportes: TenantIncident[];
}

/** Repositorio de scoring de inquilinos (Fase 6). */
export class DrizzleScoringRepository {
  /**
   * Calcula el puntaje (1-100) de cada cliente con contratos firmados,
   * según la tardanza en pagos y las incidencias de convivencia registradas.
   */
  async listTenantScores(): Promise<TenantScoreRow[]> {
    const contracts = await db
      .select({
        id: schema.contracts.id,
        clienteId: schema.contracts.clienteId,
      })
      .from(schema.contracts)
      .where(
        and(
          inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO"]),
          isNull(schema.contracts.eliminadoEn),
        ),
      );

    if (contracts.length === 0) return [];

    const clienteIds = [...new Set(contracts.map((c) => c.clienteId))];
    const contractIds = contracts.map((c) => c.id);
    const contractToCliente = new Map(contracts.map((c) => [c.id, c.clienteId]));

    const [clientes, pagos, incidencias] = await Promise.all([
      db
        .select({
          id: schema.clients.id,
          nombres: schema.clients.nombres,
          apellidos: schema.clients.apellidos,
          documentoIdentidad: schema.clients.documentoIdentidad,
          telefono: schema.clients.telefono,
        })
        .from(schema.clients)
        .where(inArray(schema.clients.id, clienteIds)),
      db
        .select({
          contractId: schema.payments.contractId,
          periodo: schema.payments.periodo,
          estado: schema.payments.estado,
          fechaPago: schema.payments.fechaPago,
        })
        .from(schema.payments)
        .where(
          and(
            inArray(schema.payments.contractId, contractIds),
            isNull(schema.payments.eliminadoEn),
          ),
        ),
      db
        .select({
          clienteId: schema.tenantIncidents.clienteId,
          tipo: schema.tenantIncidents.tipo,
          severidad: schema.tenantIncidents.severidad,
        })
        .from(schema.tenantIncidents)
        .where(isNull(schema.tenantIncidents.eliminadoEn)),
    ]);

    const hoy = todayDayNumber();
    // La medición de tardanza empieza HOY: las cuotas de períodos anteriores al
    // mes actual no generan penalización (no hay antecedentes de mora).
    const inicioMesActual = (() => {
      const now = new Date();
      const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return Math.floor(utc / DIAS_MS);
    })();

    const pagosPorCliente = new Map<string, PaymentInput[]>();
    for (const pago of pagos) {
      const clienteId = contractToCliente.get(pago.contractId);
      if (!clienteId) continue;
      const periodo = toDayNumber(pago.periodo);
      if (periodo === null) continue;

      let diasAtrasoPagado = 0;
      let diasVencidoPendiente = 0;
      if (periodo >= inicioMesActual) {
        if (pago.estado === "PAGADO" || pago.estado === "PARCIAL") {
          const fechaPago = toDayNumber(pago.fechaPago);
          if (fechaPago !== null && fechaPago > periodo) {
            diasAtrasoPagado = fechaPago - periodo;
          }
        } else if (pago.estado === "PENDIENTE" || pago.estado === "VENCIDO") {
          if (periodo < hoy) diasVencidoPendiente = hoy - periodo;
        }
      }

      const lista = pagosPorCliente.get(clienteId) ?? [];
      lista.push({ diasAtrasoPagado, diasVencidoPendiente });
      pagosPorCliente.set(clienteId, lista);
    }

    const incidenciasPorCliente = new Map<string, IncidentInput[]>();
    for (const inc of incidencias) {
      const lista = incidenciasPorCliente.get(inc.clienteId) ?? [];
      lista.push({ tipo: inc.tipo, severidad: inc.severidad });
      incidenciasPorCliente.set(inc.clienteId, lista);
    }

    const contratosPorCliente = new Map<string, number>();
    for (const c of contracts) {
      contratosPorCliente.set(c.clienteId, (contratosPorCliente.get(c.clienteId) ?? 0) + 1);
    }

    const rows: TenantScoreRow[] = clientes.map((cliente) => {
      const result = computeTenantScore({
        pagos: pagosPorCliente.get(cliente.id) ?? [],
        incidencias: incidenciasPorCliente.get(cliente.id) ?? [],
      });
      return {
        clienteId: cliente.id,
        nombres: cliente.nombres,
        apellidos: cliente.apellidos,
        documentoIdentidad: cliente.documentoIdentidad,
        telefono: cliente.telefono,
        contratosActivos: contratosPorCliente.get(cliente.id) ?? 0,
        score: result.score,
        band: result.band,
        breakdown: result.breakdown,
      };
    });

    return rows.sort((a, b) => a.score - b.score);
  }

  async listIncidents(clienteId?: string): Promise<TenantIncident[]> {
    const rows = await db
      .select()
      .from(schema.tenantIncidents)
      .where(
        clienteId
          ? and(
              eq(schema.tenantIncidents.clienteId, clienteId),
              isNull(schema.tenantIncidents.eliminadoEn),
            )
          : isNull(schema.tenantIncidents.eliminadoEn),
      )
      .orderBy(schema.tenantIncidents.createdAt);
    return rows.map((row) => ({
      id: row.id,
      clienteId: row.clienteId,
      tipo: row.tipo,
      severidad: row.severidad,
      descripcion: row.descripcion,
      departamentoCodigo: row.departamentoCodigo,
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Lista los clientes que tienen reportes activos, con todos sus reportes.
   * Se usa en el panel "Clientes reportados" del dashboard.
   */
  async listReportedClients(): Promise<ReportedClient[]> {
    const rows = await db
      .select({
        id: schema.tenantIncidents.id,
        clienteId: schema.tenantIncidents.clienteId,
        tipo: schema.tenantIncidents.tipo,
        severidad: schema.tenantIncidents.severidad,
        descripcion: schema.tenantIncidents.descripcion,
        departamentoCodigo: schema.tenantIncidents.departamentoCodigo,
        creadoPor: schema.tenantIncidents.creadoPor,
        createdAt: schema.tenantIncidents.createdAt,
        nombres: schema.clients.nombres,
        apellidos: schema.clients.apellidos,
        documentoIdentidad: schema.clients.documentoIdentidad,
        telefono: schema.clients.telefono,
      })
      .from(schema.tenantIncidents)
      .innerJoin(
        schema.clients,
        eq(schema.clients.id, schema.tenantIncidents.clienteId),
      )
      .where(isNull(schema.tenantIncidents.eliminadoEn))
      .orderBy(desc(schema.tenantIncidents.createdAt));

    const porCliente = new Map<string, ReportedClient>();
    for (const row of rows) {
      let cliente = porCliente.get(row.clienteId);
      if (!cliente) {
        const nombre = [row.nombres, row.apellidos].filter(Boolean).join(" ");
        cliente = {
          clienteId: row.clienteId,
          nombre: nombre || "Cliente sin nombre",
          documentoIdentidad: row.documentoIdentidad,
          telefono: row.telefono,
          totalReportes: 0,
          reportes: [],
        };
        porCliente.set(row.clienteId, cliente);
      }
      cliente.reportes.push({
        id: row.id,
        clienteId: row.clienteId,
        tipo: row.tipo,
        severidad: row.severidad,
        descripcion: row.descripcion,
        departamentoCodigo: row.departamentoCodigo,
        creadoPor: row.creadoPor,
        createdAt: row.createdAt.toISOString(),
      });
      cliente.totalReportes++;
    }

    return [...porCliente.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    );
  }

  async createIncident(input: {
    clienteId: string;
    tipo?: string;
    severidad?: string;
    descripcion?: string;
    departamentoCodigo?: string | null;
    creadoPor?: string | null;
  }): Promise<TenantIncident> {
    const departamentoCodigo =
      input.departamentoCodigo?.trim() ||
      (await this.resolveDepartamentoCodigo(input.clienteId));

    const [row] = await db
      .insert(schema.tenantIncidents)
      .values({
        clienteId: input.clienteId,
        tipo: input.tipo ?? "CONVIVENCIA",
        severidad: input.severidad ?? "MEDIA",
        descripcion: input.descripcion ?? "",
        departamentoCodigo,
        creadoPor: input.creadoPor ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo registrar la incidencia");
    return {
      id: row.id,
      clienteId: row.clienteId,
      tipo: row.tipo,
      severidad: row.severidad,
      descripcion: row.descripcion,
      departamentoCodigo: row.departamentoCodigo,
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * El departamento del cliente ya está asignado por su contrato vigente,
   * así que se resuelve automáticamente sin pedirlo en el formulario.
   */
  private async resolveDepartamentoCodigo(
    clienteId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({ codigo: schema.departments.codigo })
      .from(schema.contracts)
      .innerJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId),
      )
      .where(
        and(
          eq(schema.contracts.clienteId, clienteId),
          inArray(schema.contracts.estado, ["FIRMADO", "NOTARIADO"]),
          isNull(schema.contracts.eliminadoEn),
        ),
      )
      .orderBy(desc(schema.contracts.creadoEn))
      .limit(1);
    return row?.codigo ?? null;
  }

  async softDeleteIncident(id: string): Promise<boolean> {
    const [row] = await db
      .update(schema.tenantIncidents)
      .set({ eliminadoEn: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.tenantIncidents.id, id), isNull(schema.tenantIncidents.eliminadoEn)))
      .returning({ id: schema.tenantIncidents.id });
    return Boolean(row);
  }
}
