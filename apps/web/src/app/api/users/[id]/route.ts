import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Permission, USER_ROLES } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { isPasswordLongEnough, MIN_PASSWORD_MESSAGE } from "@/lib/password-policy";
import {
  updateAuthEmail,
  updateAuthPassword,
  isUsersAdminConfigured,
  setAuthUserBanned,
} from "@/lib/users-admin";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userJson(r: {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** PATCH /api/users/[id] — actualizar usuario (user.manage). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.USER_MANAGE);
    if (denied) return denied;

    const { id } = params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      email?: unknown;
      role?: unknown;
      active?: unknown;
      password?: unknown;
    };

    const repo = new dbModule.DrizzleUserRepository();
    const current = await repo.findById(id);
    if (!current) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const patch: { name?: string; email?: string; role?: UserRole; active?: boolean } = {};
    let newEmail: string | undefined;

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
      }
      patch.name = name;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Email inválido" }, { status: 400 });
      }
      if (email !== current.email) {
        const conflict = await repo.findByEmail(email);
        if (conflict && conflict.id !== id) {
          return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
        }
        patch.email = email;
        newEmail = email;
      }
    }
    if (body.role !== undefined) {
      const role = String(body.role).toUpperCase() as UserRole;
      if (!USER_ROLES.includes(role)) {
        return NextResponse.json({ error: `Rol inválido: ${role}` }, { status: 400 });
      }
      if (
        role === "DEVELOPER" &&
        auth.user.role !== "DEVELOPER" &&
        auth.user.role !== "ADMIN"
      ) {
        return NextResponse.json(
          { error: "Solo el Developer y el Administrador pueden asignar ese rol" },
          { status: 403 }
        );
      }
      if (role === "DEVELOPER" && current.role !== "DEVELOPER") {
        const [developer] = await dbModule.db
          .select({ id: dbModule.schema.users.id })
          .from(dbModule.schema.users)
          .where(eq(dbModule.schema.users.role, "DEVELOPER"))
          .limit(1);
        if (developer) {
          return NextResponse.json({ error: "Ya existe un usuario Developer" }, { status: 409 });
        }
      }
      patch.role = role;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "El estado activo debe ser booleano" }, { status: 400 });
      }
      if (
        body.active === false &&
        requirePermission(auth.user, Permission.USER_DELETE) !== null
      ) {
        return NextResponse.json({ error: "No tienes permiso para desactivar usuarios" }, { status: 403 });
      }
      if (body.active === false && current.id === auth.user.id) {
        return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 });
      }
      patch.active = body.active === true;
    }
    const password = typeof body.password === "string" ? body.password : "";

    if (Object.keys(patch).length === 0 && !password) {
      return NextResponse.json({ error: "No hay cambios que aplicar" }, { status: 400 });
    }
    if (password && !isPasswordLongEnough(password)) {
      return NextResponse.json({ error: MIN_PASSWORD_MESSAGE }, { status: 400 });
    }

    const syncAuth = password || newEmail;
    if (syncAuth && !isUsersAdminConfigured()) {
      return NextResponse.json(
        { error: "No se puede sincronizar la credencial: SUPABASE_SERVICE_ROLE_KEY no está configurado" },
        { status: 500 }
      );
    }

    if (newEmail) await updateAuthEmail(current.email, newEmail);
    if (password) await updateAuthPassword(newEmail ?? current.email, password);

    const updated = Object.keys(patch).length
      ? await repo.update(id, patch)
      : current;

    // SEC-077: al desactivar/reactivar, sincronizar el acceso en Supabase Auth
    // (banear bloquea login y refresco de tokens). Best-effort: la app ya niega
    // acceso con active=false, no rompemos la operación si Supabase falla.
    let sessionsRevoked = false;
    if (patch.active === false && current.active !== false && isUsersAdminConfigured()) {
      try {
        await setAuthUserBanned(current.email, true);
        sessionsRevoked = true;
      } catch (e) {
        console.error("[users] no se pudo banear en Supabase Auth:", (e as Error).message);
      }
    } else if (patch.active === true && current.active === false && isUsersAdminConfigured()) {
      try {
        await setAuthUserBanned(newEmail ?? current.email, false);
      } catch (e) {
        console.error("[users] no se pudo desbanear en Supabase Auth:", (e as Error).message);
      }
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "USER_UPDATED",
      module: "USERS",
      entityType: "USER",
      entityId: updated?.id ?? id,
      previous: {
        email: current.email,
        role: current.role,
        active: current.active,
      },
      current: {
        email: updated?.email ?? null,
        role: updated?.role ?? null,
        active: updated?.active ?? null,
      },
      metadata: {
        roleChanged: patch.role !== undefined && patch.role !== current.role,
        emailChanged: Boolean(newEmail),
        activeChanged: patch.active !== undefined && patch.active !== current.active,
        passwordReset: Boolean(password),
        sessionsRevoked,
      },
    });

    return NextResponse.json({ user: userJson(updated!), passwordReset: Boolean(password) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/users/[id] — desactivar usuario (user.manage). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.USER_DELETE);
    if (denied) return denied;

    const { id } = params;
    const repo = new dbModule.DrizzleUserRepository();
    const current = await repo.findById(id);
    if (!current) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (current.id === auth.user.id) {
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 });
    }

    const updated = await repo.update(id, { active: false });

    // SEC-077: revocar acceso en Supabase Auth (best-effort, ver PATCH).
    let sessionsRevoked = false;
    if (isUsersAdminConfigured()) {
      try {
        await setAuthUserBanned(current.email, true);
        sessionsRevoked = true;
      } catch (e) {
        console.error("[users] no se pudo banear en Supabase Auth:", (e as Error).message);
      }
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "USER_DEACTIVATED",
      module: "USERS",
      entityType: "USER",
      entityId: id,
      previous: { email: current.email, active: current.active },
      current: { email: current.email, active: false },
      metadata: { sessionsRevoked },
    });

    return NextResponse.json({ user: userJson(updated!), sessionsRevoked });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}