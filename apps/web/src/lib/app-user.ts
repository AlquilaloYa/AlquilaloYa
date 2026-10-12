import { Permission } from "@contract/domain/rbac";
import type { DbUserModule, ResolvedUser } from "@/lib/session";

/**
 * Construye el usuario de sesión (rol + permisos) desde la tabla `users`, o
 * `null` si no existe o está inactivo. Reutilizado por el login y el flujo MFA.
 */
export async function buildSessionUser(
  dbModule: DbUserModule,
  email: string
): Promise<ResolvedUser | null> {
  const repo = new dbModule.DrizzleUserRepository();
  const appUser = await repo.findByEmail(email);
  if (!appUser || appUser.active === false) return null;
  const permissionKeys = await repo.listAdditionalPermissions(appUser.id);
  const additionalPermissions = Object.values(Permission).filter((permission) =>
    permissionKeys.includes(permission)
  );
  return { ...appUser, additionalPermissions };
}
