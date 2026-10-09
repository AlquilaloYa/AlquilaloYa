import { NextResponse } from "next/server";
import {
  loginWithPassword,
  applySessionCookies,
  clearSessionCookies,
} from "@/lib/supabase-auth";
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
      return clearSessionCookies(res);
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
    return applySessionCookies(res, {
      access_token: session.access_token,
      ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
