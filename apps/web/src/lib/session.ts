import { AccessControl, Permission } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import { mfaEnforce } from "@contract/config/env";
import { NextResponse } from "next/server";
import {
  applySessionCookies,
  isNativeMobileRequest,
  resolveSession,
  SupabaseAuthUnavailableError,
} from "@/lib/supabase-auth";
import { readSessionTokens } from "@/lib/session-cookies";
import { isMfaPrivilegedRole } from "@/lib/mfa-policy";

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
  | {
      user: ResolvedUser;
      sessionTokens: {
        accessToken: string;
        refreshToken?: string;
        refreshed?: { access_token: string; refresh_token?: string };
      };
    }
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
    findByEmailWithPermissions(email: string): Promise<{
      user: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        active?: boolean;
      } | null;
      permissionKeys: string[];
    }>;
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
  let identity: Awaited<ReturnType<typeof resolveSession>>;
  try {
    identity = await resolveSession(req);
  } catch (error) {
    if (!(error instanceof SupabaseAuthUnavailableError)) throw error;
    console.warn("[auth] Supabase Auth no disponible para validar sesión");
    const response = NextResponse.json(
      {
        error: "No se pudo validar la sesión por una demora temporal. Inténtalo de nuevo.",
        code: "AUTH_PROVIDER_UNAVAILABLE",
      },
      { status: 503 },
    );
    response.headers.set("Retry-After", "5");
    return { error: response };
  }
  if (!identity) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const preserveRefreshedSession = (response: NextResponse) =>
    identity.refreshed
      ? applySessionCookies(
          response,
          identity.refreshed,
          isNativeMobileRequest(req),
        )
      : response;
  const rawTokens = readSessionTokens(req);
  const rawAccessToken = rawTokens.accessToken;
  const accessToken = identity.refreshed?.access_token ?? rawAccessToken;
  if (!accessToken) {
    return {
      error: preserveRefreshedSession(
        NextResponse.json({ error: "No autenticado" }, { status: 401 }),
      ),
    };
  }
  const repository = new dbModule.DrizzleUserRepository();
  const { user, permissionKeys } = await repository.findByEmailWithPermissions(
    identity.email
  );
  if (!user || user.active === false) {
    return {
      error: preserveRefreshedSession(
        NextResponse.json(
          { error: "Usuario sin acceso al sistema" },
          { status: 403 },
        ),
      ),
    };
  }
  // SEC-015: exigir MFA (AAL2) a roles privilegiados cuando está activado.
  if (mfaEnforce() && isMfaPrivilegedRole(user.role) && identity.aal !== "aal2") {
    return {
      error: preserveRefreshedSession(
        NextResponse.json(
          {
            error: "Se requiere autenticación de dos factores (MFA) para este rol",
            code: "MFA_REQUIRED",
          },
          { status: 403 },
        ),
      ),
    };
  }
  const additionalPermissions = Object.values(Permission).filter((permission) =>
    permissionKeys.includes(permission)
  );
  return {
    user: { ...user, additionalPermissions },
    sessionTokens: {
      accessToken,
      ...(identity.refreshed?.refresh_token ?? rawTokens.refreshToken
        ? { refreshToken: identity.refreshed?.refresh_token ?? rawTokens.refreshToken }
        : {}),
      ...(identity.refreshed ? { refreshed: identity.refreshed } : {}),
    },
  };
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
    role !== "ADMIN" &&
    (permission === Permission.USER_DELETE ||
      permission === Permission.PERMISSION_REQUEST_APPROVE)
  ) {
    return NextResponse.json(
      { error: "Este permiso está reservado al Developer y al Administrador" },
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

/** El rol de asistente administra datos operativos, pero no puede eliminarlos. */
export function denyAdministrativeAssistantDeletion(
  principal: Pick<ResolvedUser, "role">
): NextResponse | null {
  if (principal.role !== "ASISTENTE_ADMINISTRATIVO") return null;
  return NextResponse.json(
    { error: "Los asistentes administrativos no pueden eliminar registros" },
    { status: 403 }
  );
}
