import type { UUID } from "../common/index";
import type { ContractSnapshotData } from "../snapshot/index";
import type {
  Contract,
  CreateContractInput,
  UpdateDraftInput,
  RenovarContratoInput,
  ContractWithRelations,
} from "./contract";
import type { ContractStatus } from "./enums";
import { ContractStatus as StatusConst } from "./enums";
import { ContractStateMachine } from "./state-machine";
import type {
  ContractDomainEvent,
  ContractDomainEventName,
} from "./domain-events";
import { ContractDomainEventName as EventName } from "./domain-events";
import { randomUUID } from "node:crypto";

/** Contrato de persistencia mínima para mantener el dominio desacoplado. */
export interface ContractRepository {
  findById(id: UUID): Promise<Contract | null>;
  findWithRelations(id: UUID): Promise<ContractWithRelations | null>;
  create(input: CreateContractInput): Promise<Contract>;
  update(id: UUID, changes: UpdateDraftInput): Promise<Contract>;
  updateEstado(id: UUID, estado: ContractStatus): Promise<Contract>;
  setSnapshot(id: UUID, snapshotId: UUID): Promise<Contract>;
  /** Resuelve el contrato registrando motivo y fecha. */
  resolve(id: UUID, motivo: string): Promise<Contract>;
  /** Cuenta renovaciones previas de un contrato (por prefijo de código). */
  countRenovaciones(codigoBase: string): Promise<number>;
}

export interface SnapshotPort {
  create(data: ContractSnapshotData): Promise<{ id: UUID; codigoContrato: string }>;
  assertInmutable(id: UUID): Promise<void>;
}

/** Emite un evento de dominio (alimenta actividad/auditoría). */
export type DomainEventSink = (
  event: ContractDomainEvent
) => void | Promise<void>;

function nowIso(): string {
  return new Date().toISOString();
}

const MONTO = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  date.setUTCMonth(date.getUTCMonth() + months);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mm}-${dd}`;
}

function fmtMes(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[(m as number) - 1]} de ${y}`;
}

/** Períodos mensuales del canon entre las fechas contractuales. */
function cronogramaPeriodos(
  fechaInicio: string,
  fechaFin: string,
  montoCanonMensual: string
): Array<{ mes: string; monto: string }> {
  const periodos: Array<{ mes: string; monto: string }> = [];
  let cursor = fechaInicio;
  let guard = 0;
  while (cursor <= fechaFin && guard < 240) {
    periodos.push({
      mes: fmtMes(cursor),
      monto: MONTO.format(Number(montoCanonMensual) || 0),
    });
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return periodos;
}

export class ContractService {
  constructor(
    private readonly repo: ContractRepository,
    private readonly snapshots: SnapshotPort,
    private readonly sink: DomainEventSink = () => {}
  ) {}

  private async emit(
    type: ContractDomainEventName,
    contractId: UUID,
    estadoAnterior: ContractStatus,
    estadoNuevo: ContractStatus | null,
    snapshotId?: UUID | null,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await this.sink({
      type,
      contractId,
      snapshotId: snapshotId ?? null,
      estadoAnterior,
      estadoNuevo,
      data,
      ocurridoEn: nowIso(),
    });
  }

  /** Borrador puede crearse. Estado inicial BORRADOR sin snapshot. */
  async createContract(input: CreateContractInput): Promise<Contract> {
    const created = await this.repo.create({
      ...input,
      plantillaVersionId: input.plantillaVersionId,
      montoCanonMensual: input.montoCanonMensual,
      depositoGarantia: input.depositoGarantia,
      mantenimiento: input.mantenimiento,
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
    });
    await this.emit(
      EventName.CONTRACT_CREATED,
      created.id,
      StatusConst.BORRADOR,
      StatusConst.BORRADOR
    );
    return created;
  }

  /** Solo borradores se editan. */
  async updateDraft(id: UUID, changes: UpdateDraftInput): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    if (current.estado !== StatusConst.BORRADOR) {
      throw new Error("Solo pueden editarse contratos en estado BORRADOR");
    }
    if (current.snapshotId) {
      throw new Error("El contrato ya fue emitido y no puede editarse");
    }
    const updated = await this.repo.update(id, changes);
    await this.emit(
      EventName.CONTRACT_UPDATED,
      id,
      current.estado,
      current.estado
    );
    return updated;
  }

  /** Solicitar emisión: BORRADOR -> PENDIENTE_EMISION. */
  async requestEmission(id: UUID): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    ContractStateMachine.assertTransition(
      current.estado,
      StatusConst.PENDIENTE_EMISION
    );
    const updated = await this.repo.updateEstado(id, StatusConst.PENDIENTE_EMISION);
    await this.emit(
      EventName.CONTRACT_EMISSION_REQUESTED,
      id,
      current.estado,
      StatusConst.PENDIENTE_EMISION
    );
    return updated;
  }

  /** Emitir contrato: crea snapshot inmutable, cláusulas (separación/mueblería) y anexo de cronograma. Pasa a EMITIDO. */
  async emitContract(contract: ContractWithRelations): Promise<Contract> {
    ContractStateMachine.assertTransition(contract.estado, StatusConst.EMITIDO);

    const clausulas = this.buildClausulas(contract);
    const anexos = this.buildAnexos(contract);

    const snapshot = await this.snapshots.create({
      codigoContrato: contract.codigoContrato,
      plantillaVersionId: contract.plantillaVersionId,
      datosCliente: contract.cliente as unknown as Record<string, unknown>,
      datosDepartamento: contract.departamento as unknown as Record<string, unknown>,
      datosContrato: {
        codigoContrato: contract.codigoContrato,
        montoCanonMensual: contract.montoCanonMensual,
        depositoGarantia: contract.depositoGarantia,
        mantenimiento: contract.mantenimiento,
        fechaInicio: contract.fechaInicio,
        fechaFin: contract.fechaFin,
        separacionDetalle: contract.separacionDetalle,
        copiaDni: contract.copiaDni,
        muebleriaItems: contract.muebleriaItems ?? [],
        mascotasItems: contract.mascotasItems ?? [],
      },
      clausulas,
      anexos,
    });

    await this.emit(
      EventName.SNAPSHOT_CREATED,
      contract.id,
      contract.estado,
      StatusConst.EMITIDO,
      snapshot.id
    );

    await this.repo.setSnapshot(contract.id, snapshot.id);
    const emitted = await this.repo.updateEstado(contract.id, StatusConst.EMITIDO);

    await this.emit(
      EventName.CONTRACT_EMITTED,
      contract.id,
      contract.estado,
      StatusConst.EMITIDO,
      snapshot.id,
      { codigoContrato: contract.codigoContrato }
    );
    return emitted;
  }

  /** Cláusulas específicas derivadas del contrato. */
  private buildClausulas(
    contract: Pick<
      Contract,
      "separacion" | "separacionDetalle" | "muebleriaItems" | "mascotasItems"
    >
  ): Array<{ versionId: UUID; contenido: string }> {
    const clausulas: Array<{ versionId: UUID; contenido: string }> = [];

    if (contract.separacion) {
      clausulas.push({
        versionId: randomUUID(),
        contenido: `CLÁUSULA DE SEPARACIÓN — El arrendatario declara haber entregado la suma de S/ ${contract.separacionDetalle?.monto ?? "500.00"} por concepto de separación del departamento. Dicha suma será imputada al pago del canon de arrendamiento, o retenida por la arrendadora en caso de que el arrendatario incumpla la separación pactada.`,
      });
    }

    const items = (contract.muebleriaItems ?? []).filter(Boolean).map(String);
    clausulas.push({
      versionId: randomUUID(),
      contenido:
        "CLÁUSULA DE INVENTARIO DE MUEBLES — El arrendador entrega al arrendatario, y este declara recibir en buen estado de conservación, los siguientes muebles y enseres: " +
        (items.length > 0 ? items.join(", ") : "—") +
        ".",
    });

    const mascotas = (contract.mascotasItems ?? []).filter(Boolean).map(String);
    clausulas.push({
      versionId: randomUUID(),
      contenido:
        "CLÁUSULA DE MASCOTAS — El arrendatario declara que mantendrá en el departamento las siguientes mascotas: " +
        (mascotas.length > 0 ? mascotas.join(", ") : "—") +
        ". Se obliga a no albergar mascotas distintas a las declaradas y a responder por los daños que estas pudieran ocasionar al inmueble o a las áreas comunes.",
    });

    return clausulas;
  }

  /** Anexos derivados: cronograma de pagos del canon mensual. */
  private buildAnexos(
    contract: Pick<
      Contract,
      "fechaInicio" | "fechaFin" | "montoCanonMensual" | "mantenimiento"
    >
  ): Array<{ versionId: UUID; contenido: string }> {
    const anexos: Array<{ versionId: UUID; contenido: string }> = [];

    const periodos = cronogramaPeriodos(
      contract.fechaInicio,
      contract.fechaFin,
      contract.montoCanonMensual
    );

    const lineas = [
      "ANEXO: CRONOGRAMA DE PAGOS DE CANON DE ARRENDAMIENTO",
      "",
      ...periodos.map(
        (p, i) => `Cuota ${i + 1} (${p.mes}): ${p.monto}`
      ),
      "",
      `Nota: el canon mensual no incluye el mantenimiento de ${MONTO.format(Number(contract.mantenimiento) || 0)}.`,
    ];

    anexos.push({
      versionId: randomUUID(),
      contenido: lineas.join("\n"),
    });

    return anexos;
  }

  /** Resolver contrato: (PENDIENTE_FIRMA | FIRMADO) -> RESUELTO, registrando motivo. */
  async resolveContract(id: UUID, motivo: string): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    ContractStateMachine.assertTransition(current.estado, StatusConst.RESUELTO);
    const resolved = await this.repo.resolve(id, motivo);
    await this.emit(
      EventName.CONTRACT_RESOLVED,
      id,
      current.estado,
      StatusConst.RESUELTO,
      current.snapshotId,
      { motivo }
    );
    return resolved;
  }

  /** Renovar un contrato FIRMADO: crea un nuevo borrador vinculado (renovadoDe). */
  async renewContract(
    id: UUID,
    input: RenovarContratoInput
  ): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    if (current.estado !== StatusConst.FIRMADO) {
      throw new Error("Solo pueden renovarse contratos firmados");
    }

    const count = await this.repo.countRenovaciones(current.codigoContrato);
    const nuevo = await this.repo.create({
      codigoContrato: `${current.codigoContrato}-R${count + 1}`,
      clienteId: current.clienteId,
      departamentoId: current.departamentoId,
      plantillaVersionId: current.plantillaVersionId,
      montoCanonMensual: current.montoCanonMensual,
      depositoGarantia: current.depositoGarantia,
      mantenimiento: current.mantenimiento,
      fechaInicio: input.nuevaFechaInicio,
      fechaFin: input.nuevaFechaFin,
      renovadoDe: current.id,
      separacion: current.separacion,
      separacionDetalle: current.separacionDetalle,
      copiaDni: current.copiaDni,
      muebleriaItems: current.muebleriaItems,
      mascotasItems: current.mascotasItems ?? [],
    });

    await this.emit(
      EventName.CONTRACT_RENEWED,
      id,
      current.estado,
      current.estado,
      current.snapshotId,
      { nuevoContratoId: nuevo.id, nuevoCodigo: nuevo.codigoContrato }
    );
    return nuevo;
  }

  /** Solicitar firma: EMITIDO -> PENDIENTE_FIRMA. */
  async requestSignature(id: UUID): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    if (!current.snapshotId) {
      throw new Error("Debe emitirse el contrato antes de solicitar firma");
    }
    ContractStateMachine.assertTransition(
      current.estado,
      StatusConst.PENDIENTE_FIRMA
    );
    const updated = await this.repo.updateEstado(
      id,
      StatusConst.PENDIENTE_FIRMA
    );
    await this.emit(
      EventName.CONTRACT_SIGNATURE_REQUESTED,
      id,
      current.estado,
      StatusConst.PENDIENTE_FIRMA,
      current.snapshotId
    );
    return updated;
  }

  /** Firmar contrato: PENDIENTE_FIRMA -> FIRMADO. */
  async signContract(id: UUID): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    ContractStateMachine.assertTransition(current.estado, StatusConst.FIRMADO);
    const updated = await this.repo.updateEstado(id, StatusConst.FIRMADO);
    await this.emit(
      EventName.CONTRACT_SIGNED,
      id,
      current.estado,
      StatusConst.FIRMADO,
      current.snapshotId
    );
    return updated;
  }

  /** Notariar contrato: FIRMADO -> NOTARIADO. */
  async notariarContract(id: UUID): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    ContractStateMachine.assertTransition(current.estado, StatusConst.NOTARIADO);
    const updated = await this.repo.updateEstado(id, StatusConst.NOTARIADO);
    await this.emit(
      EventName.CONTRACT_NOTARIZED,
      id,
      current.estado,
      StatusConst.NOTARIADO,
      current.snapshotId
    );
    return updated;
  }

  /** Cancelar contrato desde estados no firmados (BORRADOR, PENDIENTE_EMISION, EMITIDO, PENDIENTE_FIRMA). */
  async cancelContract(id: UUID): Promise<Contract> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new Error("Contrato no encontrado");
    }
    ContractStateMachine.assertTransition(current.estado, StatusConst.CANCELADO);
    const updated = await this.repo.updateEstado(id, StatusConst.CANCELADO);
    await this.emit(
      EventName.CONTRACT_CANCELLED,
      id,
      current.estado,
      StatusConst.CANCELADO
    );
    return updated;
  }
}