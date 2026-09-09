import type { UUID } from "../common/index";
import type { ContractStatus } from "./enums";

export const ContractDomainEventName = {
  CONTRACT_CREATED: "CONTRACT_CREATED",
  CONTRACT_UPDATED: "CONTRACT_UPDATED",
  CONTRACT_EMISSION_REQUESTED: "CONTRACT_EMISSION_REQUESTED",
  CONTRACT_EMITTED: "CONTRACT_EMITTED",
  CONTRACT_CANCELLED: "CONTRACT_CANCELLED",
  CONTRACT_RESOLVED: "CONTRACT_RESOLVED",
  CONTRACT_RENEWED: "CONTRACT_RENEWED",
  CONTRACT_SIGNATURE_REQUESTED: "CONTRACT_SIGNATURE_REQUESTED",
  CONTRACT_SIGNED: "CONTRACT_SIGNED",
  CONTRACT_NOTARIZED: "CONTRACT_NOTARIZED",
  SNAPSHOT_CREATED: "SNAPSHOT_CREATED",
} as const;

export type ContractDomainEventName =
  (typeof ContractDomainEventName)[keyof typeof ContractDomainEventName];

export interface ContractDomainEvent<TData = Record<string, unknown>> {
  type: ContractDomainEventName;
  contractId: UUID;
  snapshotId?: UUID | null;
  estadoAnterior: ContractStatus;
  estadoNuevo: ContractStatus | null;
  data?: TData;
  ocurridoEn: string;
}

export type ContractEmittedEvent = ContractDomainEvent<{
  codigoContrato: string;
}>;