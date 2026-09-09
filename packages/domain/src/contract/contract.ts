import type { AuditableEntity, UUID } from "../common/index";
import type { Client } from "../client/index";
import type { Department } from "../department/index";
import type { ContractStatus } from "./enums";
import type { TemplateVersion } from "../template/index";
import type { ContractSnapshot } from "../snapshot/index";
import type { ClauseVersion } from "../clause/index";
import type { AnnexVersion } from "../annex/index";

export interface ContractSeparationDetail {
  tipo: "500" | "TOTAL" | "FLUCTUANTE";
  monto: string;
  garantiaExtendida: boolean;
  fecha: string | null;
}

export interface ContractDniAttachment {
  nombre: string;
  tipo: string;
  dataUrl: string;
}

/**
 * Contrato contractual (Fase 3).
 * - Dinero: NUMERIC(15,2).
 * - Fechas contractuales: DATE (ISO).
 * - Conserva la versión de plantilla y referencia el snapshot congelado.
 */
export interface Contract extends AuditableEntity {
  id: UUID;
  codigoContrato: string;
  clienteId: UUID;
  departamentoId: UUID;
  plantillaVersionId: UUID;
  montoCanonMensual: string;
  depositoGarantia: string;
  mantenimiento: string;
  fechaInicio: string;
  fechaFin: string;
  estado: ContractStatus;
  snapshotId: UUID | null;
  creadoPor: UUID | null;
  /** Contrato del que procede esta renovación (renovaciones). */
  renovadoDe: UUID | null;
  /** Incluye la cláusula de separación (canon de separación S/ 500). */
  separacion: boolean;
  separacionDetalle: ContractSeparationDetail | null;
  copiaDni: ContractDniAttachment[];
  /** Ítems de mueblería entregados al arrendatario (etiquetas de la ficha del contacto). */
  muebleriaItems: string[];
  /** Mascotas declaradas por el arrendatario (etiquetas de la ficha del contacto). */
  mascotasItems: string[];
  /** Motivo registrado al resolver el contrato. */
  motivoResolucion: string | null;
  /** Fecha en la que se resolvió el contrato. */
  resueltoEn: string | null;
}

export type CreateContractInput = Omit<
  Contract,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "estado"
  | "snapshotId"
  | "creadoPor"
  | "renovadoDe"
  | "motivoResolucion"
  | "resueltoEn"
> & { renovadoDe?: UUID | null };

export type UpdateDraftInput = Partial<
  Pick<
    Contract,
    | "clienteId"
    | "departamentoId"
    | "plantillaVersionId"
    | "montoCanonMensual"
    | "depositoGarantia"
    | "mantenimiento"
    | "fechaInicio"
    | "fechaFin"
    | "separacion"
    | "separacionDetalle"
    | "copiaDni"
    | "muebleriaItems"
    | "mascotasItems"
  >
>;

/** Datos para renovar un contrato vigente. */
export interface RenovarContratoInput {
  nuevaFechaInicio: string;
  nuevaFechaFin: string;
}

/** Datos para resolver un contrato (terminación anticipada). */
export interface ResolveContractInput {
  motivo: string;
}

export type ContractWithRelations = Contract & {
  cliente: Client;
  departamento: Department;
  plantillaVersion: TemplateVersion;
  snapshot: ContractSnapshot | null;
};

export type { ClauseVersion, AnnexVersion };