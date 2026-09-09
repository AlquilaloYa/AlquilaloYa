import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { getIntegrationService } from "@/lib/integration-service";

export const dynamic = "force-dynamic";

function instanceJson(r: {
  id: string;
  type: string;
  provider: string;
  name: string;
  description?: string | null;
  status: string;
  enabled: boolean;
  config: unknown;
  credentialId?: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: r.id,
    type: r.type,
    provider: r.provider,
    name: r.name,
    description: r.description ?? null,
    status: r.status,
    enabled: r.enabled,
    config: r.config,
    credentialId: r.credentialId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/integrations/:id — acciones sobre una instancia (integration.manage).
 * Admite: actualización, enable/disable, credenciales, test y dispatch.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.INTEGRATION_MANAGE);
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const service = await getIntegrationService();

    if (body.action === "test") {
      const result = await service.testConnection(id);
      return NextResponse.json({ result });
    }

    if (body.action === "credentials") {
      const summary = await service.setCredentials(id, body.credentials);
      return NextResponse.json(summary);
    }

    if (body.action === "enable" || body.action === "disable") {
      const updated = await service.setEnabled(id, body.action === "enable");
      return NextResponse.json(instanceJson(updated));
    }

    if (body.action === "dispatch") {
      const idempotencyKey = String(body.idempotencyKey ?? crypto.randomUUID());
      const result = await service.dispatch(
        id,
        body.outboundAction ?? "DISPATCH",
        body.payload ?? {},
        idempotencyKey
      );
      const found = await service.findById(id);
      return NextResponse.json({
        ...(found ? instanceJson(found) : {}),
        result,
      });
    }

    const updated = await service.update(id, {
      provider: body.provider,
      name: body.name,
      description: body.description,
      config: body.config,
      enabled: body.enabled,
    });
    return NextResponse.json(instanceJson(updated));
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** DELETE /api/integrations/:id — eliminar instancia (integration.manage). */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, _req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.INTEGRATION_MANAGE);
    if (denied) return denied;

    const { id } = await params;
    const service = await getIntegrationService();
    await service.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}