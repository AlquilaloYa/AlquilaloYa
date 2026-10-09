import { AccessControl, Permission } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/supabase-auth";

/**
 * Cabecera legada que el cliente aún envía (apiFetch). SE IGNOREA para autorizar:
 * la identidad proviene SOLO de la sesión de Supabase validada en servidor.
 */
export const SESSION_HEADER = "x-user-email";

export interface ResolvedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  additionalPermissions: Permission[];
}

export type AuthResult =
  | { user: ResolvedUser }
  | { error: NextResponse };

export interface DbUserModule {
  DrizzleUserRepository: new () => {
    findByEmail(email: string): Promise<{
      id: string;
      email: string;
      name: string;
      role: UserRole;
      active?: boolean;
    } | null>;
    listAdditionalPermissions(userId: string): Promise<string[]>;
  };
}

/**
 * Requiere autenticación REAL:
 * 1) Valida el token de sesión contra Supabase Auth (resolveSession).
 * 2) Mapea el email a un usuario activo de la tabla `users` para obtener el rol.
 * Sin sesión válida → 401. Email sin usuario activo → 403.
 */
export async function requireUser(
  dbModule: DbUserModule,
  req: Request
): Promise<AuthResult> {
  const identity = await resolveSession(req);
  if (!identity) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const user = await new dbModule.DrizzleUserRepository().findByEmail(identity.email);
  if (!user || user.active === false) {
    return {
      error: NextResponse.json(
        { error: "Usuario sin acceso al sistema" },
        { status: 403 }
      ),
    };
  }
  const permissionKeys = await new dbModule.DrizzleUserRepository()
    .listAdditionalPermissions(user.id);
  const additionalPermissions = Object.values(Permission).filter((permission) =>
    permissionKeys.includes(permission)
  );
  return { user: { ...user, additionalPermissions } };
}

/** Verifica permiso del usuario autenticado; 403 si no. */
export function requirePermission(
  principal: UserRole | Pick<ResolvedUser, "role" | "additionalPermissions">,
  permission: Permission
): NextResponse | null {
  const role = typeof principal === "string" ? principal : principal.role;
  const additionalPermissions =
    typeof principal === "string" ? [] : principal.additionalPermissions;
  if (
    role !== "DEVELOPER" &&
    (permission === Permission.USER_DELETE ||
      permission === Permission.PERMISSION_REQUEST_APPROVE)
  ) {
    return NextResponse.json(
      { error: "Este permiso está reservado al Developer" },
      { status: 403 }
    );
  }
  const decision = AccessControl.forRole(role, additionalPermissions).require(permission);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: `Acceso denegado: ${decision.reason}` },
      { status: 403 }
    );
  }
  return null;
}
