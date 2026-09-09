import { describe, expect, it } from "vitest";
import { ContractStateMachine } from "./state-machine";
import { ContractStatus } from "./enums";

describe("ContractStateMachine", () => {
  it("permite la transición de BORRADOR a PENDIENTE_EMISION", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.BORRADOR,
        ContractStatus.PENDIENTE_EMISION
      )
    ).toBe(true);
  });

  it("permite la transición de EMITIDO a PENDIENTE_FIRMA", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.EMITIDO,
        ContractStatus.PENDIENTE_FIRMA
      )
    ).toBe(true);
  });

  it("no permite volver de FIRMADO a BORRADOR", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.FIRMADO,
        ContractStatus.BORRADOR
      )
    ).toBe(false);
  });

  it("no permite editar un contrato FIRMADO", () => {
    expect(
      ContractStateMachine.canTransition(ContractStatus.FIRMADO, ContractStatus.FIRMADO)
    ).toBe(false);
  });

  it("no permite pasar de BORRADOR directamente a FIRMADO", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.BORRADOR,
        ContractStatus.FIRMADO
      )
    ).toBe(false);
  });

  it("lanza error cuando la transición no está permitida", () => {
    expect(() =>
      ContractStateMachine.assertTransition(
        ContractStatus.FIRMADO,
        ContractStatus.BORRADOR
      )
    ).toThrow();
  });

  it("permite la transición de FIRMADO a NOTARIADO", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.FIRMADO,
        ContractStatus.NOTARIADO
      )
    ).toBe(true);
  });

  it("permite la transición de NOTARIADO a RESUELTO", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.NOTARIADO,
        ContractStatus.RESUELTO
      )
    ).toBe(true);
  });

  it("no permite ir de NOTARIADO a FIRMADO", () => {
    expect(
      ContractStateMachine.canTransition(
        ContractStatus.NOTARIADO,
        ContractStatus.FIRMADO
      )
    ).toBe(false);
  });
});