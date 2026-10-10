import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { PERMISSIONS, Permission } from "@contract/domain/rbac";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function requirePermissionManager(role: string) {
  if (role !== "DEVELOPER" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo el Developer y el Administrador pueden asignar permisos individuales" },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermissionManager(auth.user.role);
    if (denied) return denied;

    const target = await new dbModule.DrizzleUserRepository().findById(params.id);
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const rows = await dbModule.db
      .select({ key: dbModule.schema.permissions.key })
      .from(dbModule.schema.userPermissions)
      .innerJoin(
        dbModule.schema.permissions,
        eq(dbModule.schema.userPermissions.permissionId, dbModule.schema.permissions.id)
      )
      .where(eq(dbModule.schema.userPermissions.userId, params.id));
    const assigned = rows
      .map((row) => row.key)
      .filter((key): key is Permission =>
        (Object.values(Permission) as string[]).includes(key)
      );
    return NextResponse.json({ permissions: assigned });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermissionManager(auth.user.role);
    if (denied) return denied;

    const target = await new dbModule.DrizzleUserRepository().findById(params.id);
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      permissions?: unknown;
    };
    if (
      !Array.isArray(body.permissions) ||
      body.permissions.some(
        (permission) =>
          typeof permission !== "string" ||
          !(PERMISSIONS as readonly string[]).includes(permission)
      )
    ) {
      return NextResponse.json({ error: "La lista de permisos es inválida" }, { status: 400 });
    }
    const requested = Array.from(new Set(body.permissions as Permission[]));
    if (
      target.role !== "DEVELOPER" &&
      target.role !== "ADMIN" &&
      requested.some(
        (permission) =>
          permission === Permission.USER_DELETE ||
          permission === Permission.PERMISSION_REQUEST_APPROVE
      )
    ) {
      return NextResponse.json(
        { error: "Eliminar usuarios y aprobar solicitudes son permisos exclusivos del Developer y el Administrador" },
        { status: 400 }
      );
    }
    const rows = requested.length
      ? await dbModule.db
          .select({
            id: dbModule.schema.permissions.id,
            key: dbModule.schema.permissions.key,
          })
          .from(dbModule.schema.permissions)
          .where(inArray(dbModule.schema.permissions.key, requested))
      : [];
    if (rows.length !== requested.length) {
      return NextResponse.json(
        { error: "Faltan permisos registrados en la base de datos; ejecuta el seed de permisos" },
        { status: 500 }
      );
    }

    await dbModule.db.transaction(async (tx) => {
      await tx
        .delete(dbModule.schema.userPermissions)
        .where(eq(dbModule.schema.userPermissions.userId, params.id));
      if (rows.length) {
        await tx.insert(dbModule.schema.userPermissions).values(
          rows.map((row) => ({
            userId: params.id,
            permissionId: row.id,
          }))
        );
      }
    });

    try {
      await dbModule.db.insert(dbModule.schema.activity_events).values({
        userId: auth.user.id,
        actorType: "user",
        action: "USER_PERMISSIONS_UPDATED",
        module: "USERS",
        entityType: "USER",
        entityId: params.id,
        result: "SUCCESS",
        metadata: { permissions: requested },
      });
    } catch {
      /* el registro de actividad no bloquea el cambio de permisos */
    }

    return NextResponse.json({ permissions: requested });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
