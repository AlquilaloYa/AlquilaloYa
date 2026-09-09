import type { Permission } from "./permissions";
import { Permission as P } from "./permissions";
import type { UserRole } from "./role";

/**
 * Matriz RBAC de Fase 2. Cada rol declara los permisos que tiene.
 *
 * Principios:
 * - ADMIN gestiona usuarios, roles y todo lo demás.
 * - OPERADOR opera el día a día pero NO administra usuarios/roles.
 * - AUDITOR solo lee (riesgo de auditoría/actividad), no crea ni edita.
 * - FIRMANTE firma contratos y consulta el workflow, no administra.
 * - SUPERVISOR supervisa la operación (lee todo lo operativo).
 */
const ROLE_PERMISSION_MAP: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS_ALL()),
  OPERADOR: new Set([
    P.CLIENT_READ,
    P.CLIENT_CREATE,
    P.CLIENT_UPDATE,
    P.DEPARTMENT_READ,
    P.DEPARTMENT_CREATE,
    P.DEPARTMENT_UPDATE,
    P.CONTRACT_READ,
    P.CONTRACT_CREATE,
    P.CONTRACT_UPDATE,
    P.CONTRACT_EMIT,
    P.CONTRACT_SIGN,
    P.CONTRACT_CANCEL,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.TEMPLATE_READ,
    P.ACTIVITY_READ,
  ]),
  SUPERVISOR: new Set([
    P.CLIENT_READ,
    P.CLIENT_CREATE,
    P.CLIENT_UPDATE,
    P.DEPARTMENT_READ,
    P.DEPARTMENT_CREATE,
    P.DEPARTMENT_UPDATE,
    P.CONTRACT_READ,
    P.CONTRACT_CREATE,
    P.CONTRACT_UPDATE,
    P.CONTRACT_EMIT,
    P.CONTRACT_SIGN,
    P.CONTRACT_CANCEL,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.TEMPLATE_READ,
    P.TEMPLATE_MANAGE,
    P.ACTIVITY_READ,
    P.USER_READ,
    P.INTEGRATION_READ,
    P.INTEGRATION_MANAGE,
  ]),
  AUDITOR: new Set([
    P.CLIENT_READ,
    P.DEPARTMENT_READ,
    P.CONTRACT_READ,
    P.DOCUMENT_READ,
    P.TEMPLATE_READ,
    P.ACTIVITY_READ,
    P.AUDIT_READ,
    P.USER_READ,
    P.INTEGRATION_READ,
  ]),
  FIRMANTE: new Set([
    P.CONTRACT_READ,
    P.CONTRACT_SIGN,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.CLIENT_READ,
    P.DEPARTMENT_READ,
    P.ACTIVITY_READ,
  ]),
};

function PERMISSIONS_ALL(): Permission[] {
  return Object.values(P);
}

export function permissionsForRole(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSION_MAP[role]);
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSION_MAP[role].has(permission);
}

export function roleHasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => roleHasPermission(role, p));
}