import type { Permission } from "./permissions";
import { Permission as P } from "./permissions";
import type { UserRole } from "./role";

/**
 * Matriz RBAC. Cada rol declara los permisos que tiene.
 *
 * Principios:
 * - DEVELOPER: único rol con permiso para eliminar usuarios (USER_DELETE) y
 *   aprobar las solicitudes de permiso de los roles de solo lectura.
 * - ADMIN: controla y edita todo, pero NO puede eliminar usuarios.
 * - RRHH: solo lectura sobre la operación (no crea, no edita, no elimina);
 *   si quiere modificar algo pide permiso al Developer.
 * - ASISTENTE_ADMINISTRATIVO: igual que RRHH, con acceso de lectura además a
 *   Google SyS y Marketing.
 * - MARKETING: solo lectura y solo del módulo de marketing (no crea, no edita).
 */

const ALL_PERMISSIONS: Permission[] = Object.values(P);

export const ADMIN_PERMISSIONS: ReadonlySet<Permission> = new Set(
  ALL_PERMISSIONS.filter((perm) => perm !== P.USER_DELETE)
);

export const DEVELOPER_PERMISSIONS: ReadonlySet<Permission> = new Set(ALL_PERMISSIONS);

/** Lectura abierta de la operación: RRHH y asistente administrativo. */
const BASE_OPERATIVO: Permission[] = [
  P.HR_READ,
  P.HR_DIRECTORY_READ,
  P.HR_REQUEST_CREATE,
  P.ATTENDANCE_READ,
  P.ATTENDANCE_CREATE,
  P.CLIENT_READ,
  P.DEPARTMENT_READ,
  P.CONTRACT_READ,
  P.DOCUMENT_READ,
  P.TEMPLATE_READ,
  P.WORK_ORDER_READ,
  P.ACTIVITY_READ,
];

const ROLE_PERMISSION_MAP: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: ADMIN_PERMISSIONS,
  DEVELOPER: DEVELOPER_PERMISSIONS,
  RRHH: new Set([...BASE_OPERATIVO, P.PERMISSION_REQUEST_CREATE]),
  ASISTENTE_ADMINISTRATIVO: new Set([
    ...BASE_OPERATIVO,
    P.WEB_CONTENT_READ,
    P.PERMISSION_REQUEST_CREATE,
  ]),
  MARKETING: new Set([
    P.CLIENT_READ,
    P.CONTRACT_READ,
    P.ACTIVITY_READ,
    P.WEB_CONTENT_READ,
  ]),
};

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