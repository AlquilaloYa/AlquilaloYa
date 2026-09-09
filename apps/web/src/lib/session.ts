import { AccessControl } from "@contract/domain/rbac";
import type { UserRole, Permission } from "@contract/domain/rbac";
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
}

export type AuthResult =
  | { user: ResolvedUser }
  | { error: NextResponse };

export interface DbUserModule {
  DrizzleUserRepository: new () => {
    findByEmail(email: string): Promise<(ResolvedUser & { active?: boolean }) | null>;
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
  return { user };
}

/** Verifica permiso del usuario autenticado; 403 si no. */
export function requirePermission(
  role: UserRole,
  permission: Permission
): NextResponse | null {
  const decision = AccessControl.forRole(role).require(permission);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: `Acceso denegado: ${decision.reason}` },
      { status: 403 }
    );
  }
  return null;
}
