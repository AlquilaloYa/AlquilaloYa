import { describe, expect, it } from "vitest";
import { AccessControl } from "./access-control";
import { Permission as P } from "./permissions";
import { permissionsForRole } from "./role-permissions";

describe("AccessControl", () => {
  it("RRHH es solo lectura: ve HR y la operación, no crea ni edita", () => {
    const ac = AccessControl.forRole("RRHH");
    expect(ac.can(P.HR_READ)).toBe(true);
    expect(ac.can(P.CLIENT_READ)).toBe(true);
    expect(ac.can(P.CONTRACT_READ)).toBe(true);
    expect(ac.can(P.ACTIVITY_READ)).toBe(false);
    expect(ac.can(P.HR_CREATE)).toBe(false);
    expect(ac.can(P.HR_UPDATE)).toBe(false);
    expect(ac.can(P.CLIENT_CREATE)).toBe(false);
    expect(ac.can(P.CLIENT_UPDATE)).toBe(false);
    expect(ac.can(P.WORK_ORDER_CREATE)).toBe(false);
    expect(ac.can(P.USER_MANAGE)).toBe(false);
    expect(ac.can(P.USER_DELETE)).toBe(false);
    expect(ac.can(P.PERMISSION_REQUEST_CREATE)).toBe(true);
    expect(ac.can(P.ATTENDANCE_CREATE)).toBe(false);
    expect(ac.can(P.ATTENDANCE_READ)).toBe(false);
  });

  it("ASISTENTE_ADMINISTRATIVO suma Google/Marketing en solo lectura", () => {
    const ac = AccessControl.forRole("ASISTENTE_ADMINISTRATIVO");
    expect(ac.can(P.DEPARTMENT_READ)).toBe(true);
    expect(ac.can(P.WEB_CONTENT_READ)).toBe(false);
    expect(ac.can(P.MARKETING_READ)).toBe(true);
    expect(ac.can(P.WEB_CONTENT_UPDATE)).toBe(false);
    expect(ac.can(P.CLIENT_CREATE)).toBe(false);
    expect(ac.can(P.CLIENT_UPDATE)).toBe(false);
    expect(ac.can(P.ATTENDANCE_READ)).toBe(false);
    expect(ac.can(P.USER_MANAGE)).toBe(false);
    expect(ac.can(P.PERMISSION_REQUEST_CREATE)).toBe(true);
  });

  it("MARKETING solo lee marketing (ningún otro módulo)", () => {
    const ac = AccessControl.forRole("MARKETING");
    expect(ac.can(P.MARKETING_READ)).toBe(true);
    expect(ac.can(P.CLIENT_READ)).toBe(false);
    expect(ac.can(P.WEB_CONTENT_READ)).toBe(false);
    expect(ac.can(P.WEB_CONTENT_UPDATE)).toBe(false);
    expect(ac.can(P.CLIENT_CREATE)).toBe(false);
    expect(ac.can(P.HR_READ)).toBe(false);
    expect(ac.can(P.USER_READ)).toBe(false);
    expect(ac.can(P.CONTRACT_READ)).toBe(false);
  });

  it("DEVELOPER lo puede todo, incluido eliminar usuarios y aprobar solicitudes", () => {
    const ac = AccessControl.forRole("DEVELOPER");
    for (const permission of permissionsForRole("DEVELOPER")) {
      expect(ac.can(permission)).toBe(true);
    }
    expect(ac.can(P.USER_DELETE)).toBe(true);
    expect(ac.can(P.USER_MANAGE)).toBe(true);
    expect(ac.can(P.ROLE_MANAGE)).toBe(true);
    expect(ac.can(P.PERMISSION_REQUEST_READ)).toBe(true);
    expect(ac.can(P.PERMISSION_REQUEST_APPROVE)).toBe(true);
  });

  it("ADMIN gestiona y edita todo, incluido eliminar usuarios y aprobar solicitudes", () => {
    const ac = AccessControl.forRole("ADMIN");
    for (const permission of permissionsForRole("ADMIN")) {
      expect(ac.can(permission)).toBe(true);
    }
    expect(ac.can(P.USER_MANAGE)).toBe(true);
    expect(ac.can(P.ROLE_MANAGE)).toBe(true);
    expect(ac.can(P.PERMISSION_REQUEST_READ)).toBe(true);
    expect(ac.can(P.PERMISSION_REQUEST_APPROVE)).toBe(true);
    expect(ac.can(P.USER_DELETE)).toBe(true);
  });

  it("require devuelve reason cuando no hay permiso", () => {
    const ac = AccessControl.forRole("RRHH");
    const decision = ac.require(P.USER_DELETE);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain(P.USER_DELETE);
  });

  it("canAny respeta múltiples permisos", () => {
    const ac = AccessControl.forRole("MARKETING");
    expect(ac.canAny([P.CLIENT_CREATE, P.MARKETING_READ])).toBe(true);
    expect(ac.canAny([P.CLIENT_CREATE, P.CONTRACT_EMIT])).toBe(false);
  });

  it("permite añadir permisos individuales sin quitar los del rol", () => {
    const ac = AccessControl.forRole("MARKETING", [P.CLIENT_CREATE]);
    expect(ac.can(P.MARKETING_READ)).toBe(true);
    expect(ac.can(P.CLIENT_CREATE)).toBe(true);
    expect(ac.can(P.CLIENT_UPDATE)).toBe(false);
  });
});