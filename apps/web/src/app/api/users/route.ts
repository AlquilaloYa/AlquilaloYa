import { NextResponse } from "next/server";
import { Permission, USER_ROLES } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import {
  createAuthUser,
  generatePassword,
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

/** GET /api/users — listar usuarios (user.read). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.USER_READ);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 200);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const q = url.searchParams.get("q") ?? undefined;

    const repo = new dbModule.DrizzleUserRepository();
    const users = await repo.list({ limit, offset, ...(q ? { q } : {}) });
    return NextResponse.json({ items: users.map(userJson), limit, offset });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/users — crear usuario (user.manage). */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.USER_MANAGE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      name?: unknown;
      role?: unknown;
      active?: unknown;
      password?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = String(body.role ?? "OPERADOR").toUpperCase() as UserRole;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json({ error: `Rol inválido: ${role}` }, { status: 400 });
    }
    let password = typeof body.password === "string" ? body.password : "";
    if (password && password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const repo = new dbModule.DrizzleUserRepository();
    const existing = await repo.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    }

    if (!isUsersAdminConfigured()) {
      return NextResponse.json(
        { error: "No se puede crear la credencial: SUPABASE_SERVICE_ROLE_KEY no está configurado" },
        { status: 500 }
      );
    }
    if (!password) password = generatePassword();
    const authResult = await createAuthUser(email, password);

    const created = await repo.create({
      email,
      name,
      role,
      active: body.active === false ? false : true,
    });

    try {
      await dbModule.db.insert(dbModule.schema.activity_events).values({
        userId: auth.user.id,
        actorType: "user",
        action: "USER_CREATED",
        module: "USERS",
        entityType: "USER",
        entityId: created.id,
        result: "SUCCESS",
        metadata: {
          email: created.email,
          role: created.role,
          authCreated: authResult.created,
        },
      });
    } catch {
      /* el registro de actividad no bloquea la creación */
    }

    return NextResponse.json(
      {
        user: userJson(created),
        password,
        passwordGenerated: !(typeof body.password === "string" && body.password),
        authCreated: authResult.created,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}