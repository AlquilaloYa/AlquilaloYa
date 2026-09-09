import type { Permission } from "./permissions";
import type { UserRole } from "./role";
import {
  permissionsForRole,
  roleHasAnyPermission,
  roleHasPermission,
} from "./role-permissions";

export type AccessDecision = { allowed: boolean; reason?: string };

export class AccessControl {
  constructor(private readonly role: UserRole) {}

  static forRole(role: UserRole): AccessControl {
    return new AccessControl(role);
  }

  can(permission: Permission): boolean {
    return roleHasPermission(this.role, permission);
  }

  canAny(permissions: Permission[]): boolean {
    return roleHasAnyPermission(this.role, permissions);
  }

  require(permission: Permission): AccessDecision {
    if (this.can(permission)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Falta permiso: ${permission}` };
  }

  permissions(): Permission[] {
    return permissionsForRole(this.role);
  }
}