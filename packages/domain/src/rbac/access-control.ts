import type { Permission } from "./permissions";
import type { UserRole } from "./role";
import {
  permissionsForRole,
  roleHasPermission,
} from "./role-permissions";

export type AccessDecision = { allowed: boolean; reason?: string };

export class AccessControl {
  constructor(
    private readonly role: UserRole,
    private readonly additionalPermissions: readonly Permission[] = []
  ) {}

  static forRole(
    role: UserRole,
    additionalPermissions: readonly Permission[] = []
  ): AccessControl {
    return new AccessControl(role, additionalPermissions);
  }

  can(permission: Permission): boolean {
    return (
      roleHasPermission(this.role, permission) ||
      this.additionalPermissions.includes(permission)
    );
  }

  canAny(permissions: Permission[]): boolean {
    return permissions.some((permission) => this.can(permission));
  }

  require(permission: Permission): AccessDecision {
    if (this.can(permission)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Falta permiso: ${permission}` };
  }

  permissions(): Permission[] {
    return Array.from(
      new Set([...permissionsForRole(this.role), ...this.additionalPermissions])
    );
  }
}