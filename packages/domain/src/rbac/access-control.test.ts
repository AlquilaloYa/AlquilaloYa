import { describe, expect, it } from "vitest";
import { AccessControl } from "./access-control";
import { Permission as P } from "./permissions";
import { permissionsForRole } from "./role-permissions";

describe("AccessControl", () => {
  it("RRHH gestiona personal sin permisos de usuarios, clientes ni contratos", () => {
    const ac = AccessControl.forRole("RRHH");
    expect(ac.can(P.HR_READ)).toBe(true);
    expect(ac.can(P.HR_CREATE)).toBe(true);
    expect(ac.can(P.HR_UPDATE)).toBe(true);
    expect(ac.can(P.USER_MANAGE)).toBe(false);
    expect(ac.can(P.CLIENT_READ)).toBe(false);
    expect(ac.can(P.CONTRACT_READ)).toBe(false);
  });

  it("OPERADOR ve solo el directorio laboral mínimo y no expedientes", () => {
    const ac = AccessControl.forRole("OPERADOR");
    expect(ac.can(P.HR_DIRECTORY_READ)).toBe(true);
    expect(ac.can(P.HR_READ)).toBe(false);
    expect(ac.can(P.HR_UPDATE)).toBe(false);
  });

  it("OPERADOR no administra usuarios ni roles", () => {
    const ac = AccessControl.forRole("OPERADOR");
    expect(ac.can(P.USER_MANAGE)).toBe(false);
    expect(ac.can(P.ROLE_MANAGE)).toBe(false);
  });

  it("OPERADOR gestiona clientes y departamentos", () => {
    const ac = AccessControl.forRole("OPERADOR");
    expect(ac.can(P.CLIENT_CREATE)).toBe(true);
    expect(ac.can(P.DEPARTMENT_UPDATE)).toBe(true);
  });

  it("AUDITOR solo lee y no edita ni administra", () => {
    const ac = AccessControl.forRole("AUDITOR");
    expect(ac.can(P.AUDIT_READ)).toBe(true);
    expect(ac.can(P.ACTIVITY_READ)).toBe(true);
    expect(ac.can(P.CLIENT_CREATE)).toBe(false);
    expect(ac.can(P.CLIENT_UPDATE)).toBe(false);
    expect(ac.can(P.USER_MANAGE)).toBe(false);
  });

  it("FIRMANTE firma contratos y no administra usuarios", () => {
    const ac = AccessControl.forRole("FIRMANTE");
    expect(ac.can(P.USER_MANAGE)).toBe(false);
    expect(ac.can(P.CLIENT_CREATE)).toBe(false);
    expect(ac.can(P.CONTRACT_READ)).toBe(true);
    expect(ac.can(P.CONTRACT_SIGN)).toBe(true);
    expect(ac.can(P.CONTRACT_EMIT)).toBe(false);
  });

  it("ADMIN lo puede todo", () => {
    const ac = AccessControl.forRole("ADMIN");
    for (const permission of permissionsForRole("ADMIN")) {
      expect(ac.can(permission)).toBe(true);
    }
    expect(ac.can(P.ROLE_MANAGE)).toBe(true);
  });

  it("require devuelve reason cuando no hay permiso", () => {
    const ac = AccessControl.forRole("OPERADOR");
    const decision = ac.require(P.ROLE_MANAGE);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain(P.ROLE_MANAGE);
  });

  it("canAny respeta múltiples permisos", () => {
    const ac = AccessControl.forRole("AUDITOR");
    expect(ac.canAny([P.CLIENT_CREATE, P.CLIENT_READ])).toBe(true);
    expect(ac.canAny([P.CLIENT_CREATE, P.CONTRACT_EMIT])).toBe(false);
  });

  it("OPERADOR edita contenido web y AUDITOR solo lee", () => {
    const operador = AccessControl.forRole("OPERADOR");
    const auditor = AccessControl.forRole("AUDITOR");
    const firmante = AccessControl.forRole("FIRMANTE");
    expect(operador.can(P.WEB_CONTENT_READ)).toBe(true);
    expect(operador.can(P.WEB_CONTENT_UPDATE)).toBe(true);
    expect(auditor.can(P.WEB_CONTENT_READ)).toBe(true);
    expect(auditor.can(P.WEB_CONTENT_UPDATE)).toBe(false);
    expect(firmante.can(P.WEB_CONTENT_READ)).toBe(false);
  });
});