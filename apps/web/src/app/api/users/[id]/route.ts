import { NextResponse } from "next/server";
import { Permission, USER_ROLES } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import {
  updateAuthEmail,
  updateAuthPassword,
  isUsersAdminConfigured,
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
    const denied = requirePermission(auth.user.role, Permission.USER_MANAGE);
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
      patch.role = role;
    }
    if (body.active !== undefined) {
      patch.active = body.active === true;
    }
    const password = typeof body.password === "string" ? body.password : "";

    if (Object.keys(patch).length === 0 && !password) {
      return NextResponse.json({ error: "No hay cambios que aplicar" }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
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

    try {
      await dbModule.db.insert(dbModule.schema.activity_events).values({
        userId: auth.user.id,
        actorType: "user",
        action: "USER_UPDATED",
        module: "USERS",
        entityType: "USER",
        entityId: updated?.id ?? id,
        result: "SUCCESS",
        metadata: {
          email: updated?.email ?? null,
          role: updated?.role ?? null,
          active: updated?.active ?? null,
          passwordReset: Boolean(password),
        },
      });
    } catch {
      /* no bloquea el update */
    }

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
    const denied = requirePermission(auth.user.role, Permission.USER_MANAGE);
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

    try {
      await dbModule.db.insert(dbModule.schema.activity_events).values({
        userId: auth.user.id,
        actorType: "user",
        action: "USER_UPDATED",
        module: "USERS",
        entityType: "USER",
        entityId: id,
        result: "SUCCESS",
        metadata: { email: current.email, active: false },
      });
    } catch {
      /* no bloquea */
    }

    return NextResponse.json({ user: userJson(updated!) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}