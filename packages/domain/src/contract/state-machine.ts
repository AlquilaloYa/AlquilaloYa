import type { ContractStatus } from "./enums";
import { ContractStatus as StatusConst } from "./enums";

export abstract class ContractStateMachine {
  private static readonly allowedTransitions: Record<
    ContractStatus,
    ReadonlyArray<ContractStatus>
  > = {
    [StatusConst.BORRADOR]: [StatusConst.PENDIENTE_EMISION, StatusConst.CANCELADO],
    [StatusConst.PENDIENTE_EMISION]: [StatusConst.EMITIDO, StatusConst.BORRADOR, StatusConst.CANCELADO],
    [StatusConst.EMITIDO]: [StatusConst.PENDIENTE_FIRMA, StatusConst.CANCELADO],
    [StatusConst.PENDIENTE_FIRMA]: [StatusConst.FIRMADO, StatusConst.CANCELADO, StatusConst.RESUELTO],
    [StatusConst.FIRMADO]: [StatusConst.NOTARIADO, StatusConst.RESUELTO],
    [StatusConst.NOTARIADO]: [StatusConst.RESUELTO, StatusConst.CANCELADO],
    [StatusConst.RESUELTO]: [],
    [StatusConst.CANCELADO]: [],
  };

  static canTransition(
    from: ContractStatus,
    to: ContractStatus
  ): boolean {
    return ContractStateMachine.allowedTransitions[from].includes(to);
  }

  static assertTransition(from: ContractStatus, to: ContractStatus): void {
    if (!ContractStateMachine.canTransition(from, to)) {
      throw new Error(
        `Transición de estado no permitida: ${from} -> ${to}`
      );
    }
  }
}