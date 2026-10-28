import { NextResponse } from "next/server";
import { mfaEnforce } from "@contract/config/env";
import {
  loginWithPassword,
  applySessionCookies,
  clearSessionCookies,
  applyMfaCookies,
  clearMfaCookies,
  isNativeMobileRequest,
} from "@/lib/supabase-auth";
import { decodeJwtPayload } from "@/lib/jwt";
import { listVerifiedTotp } from "@/lib/mfa";
import { isMfaPrivilegedRole } from "@/lib/mfa-policy";
import { Permission } from "@contract/domain/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login { email, password }
 * Autentica contra Supabase Auth (email+password). Si las credenciales son
 * válidas PERO el email no está dado de alta/activo en la tabla `users`, se
 * deniega el acceso a la app (403) y se limpian las cookies.
 */
export async function POST(req: Request) {
  try {
    const native = isNativeMobileRequest(req);
    const dbModule = await import("@contract/db");
    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      password?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 });
    }

    const session = await loginWithPassword(email, password);
    if (!session) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const appUser = await new dbModule.DrizzleUserRepository().findByEmail(session.email);
    if (!appUser || appUser.active === false) {
      const res = NextResponse.json(
        { error: "Usuario autenticado pero sin acceso al sistema" },
        { status: 403 }
      );
      return clearSessionCookies(clearMfaCookies(res, native), native);
    }

    // SEC-015: si el usuario ya tiene un factor TOTP verificado, exigir el
    // segundo factor antes de emitir la sesión completa (AAL2).
    const enforceMfa = mfaEnforce();
    const verifiedFactors = enforceMfa
      ? await listVerifiedTotp(session.access_token)
      : [];
    const aal = decodeJwtPayload(session.access_token)?.aal;
    if (enforceMfa && verifiedFactors.length > 0 && aal !== "aal2") {
      // Guardar la sesión AAL1 en cookies temporales; NO da acceso todavía.
      const res = NextResponse.json({ mfaRequired: true }, { status: 200 });
      res.headers.set("Cache-Control", "no-store");
      return applyMfaCookies(
        clearSessionCookies(res, native),
        {
          access_token: session.access_token,
          ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
        },
        native,
      );
    }

    if (
      enforceMfa &&
      isMfaPrivilegedRole(appUser.role) &&
      verifiedFactors.length === 0
    ) {
      const res = NextResponse.json({ mfaSetupRequired: true }, { status: 200 });
      res.headers.set("Cache-Control", "no-store");
      return applySessionCookies(
        clearMfaCookies(res, native),
        {
          access_token: session.access_token,
          ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
        },
        native,
      );
    }

    const permissionKeys = await new dbModule.DrizzleUserRepository()
      .listAdditionalPermissions(appUser.id);
    const additionalPermissions = Object.values(Permission).filter((permission) =>
      permissionKeys.includes(permission)
    );

    const res = NextResponse.json(
      {
        user: {
          id: appUser.id,
          email: appUser.email,
          name: appUser.name,
          role: appUser.role,
          additionalPermissions,
        },
      },
      { status: 200 }
    );
    res.headers.set("Cache-Control", "no-store");
    return applySessionCookies(
      clearMfaCookies(res, native),
      {
        access_token: session.access_token,
        ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
      },
      native,
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
