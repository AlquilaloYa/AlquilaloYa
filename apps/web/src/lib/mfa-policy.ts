import type { UserRole } from "@contract/domain/rbac";

/**
 * SEC-015: roles a los que se exige MFA (AAL2) cuando `MFA_ENFORCE=true`.
 * Compartido entre `session.ts` (enforcement) y el login (mensajes).
 */
export const MFA_PRIVILEGED_ROLES: readonly UserRole[] = ["ADMIN", "DEVELOPER"];

export function isMfaPrivilegedRole(role: UserRole): boolean {
  return MFA_PRIVILEGED_ROLES.includes(role);
}
