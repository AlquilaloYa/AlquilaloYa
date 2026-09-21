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

/** GET /api/integrations — listar (integration.read). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.INTEGRATION_READ);
    if (denied) return denied;

    const service = await getIntegrationService();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? undefined;
    const provider = url.searchParams.get("provider") ?? undefined;
    const enabled = url.searchParams.has("enabled")
      ? url.searchParams.get("enabled") === "true"
      : undefined;
    const limit = Number(url.searchParams.get("limit") ?? 50) || 50;
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

    const filter: import("@contract/domain/integration").ConnectorFilter = {
      limit,
      offset,
      ...(type ? { type: type as import("@contract/domain/integration").ConnectorType } : {}),
      ...(provider ? { provider } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    };
    const countFilter: import("@contract/domain/integration").ConnectorFilter = {
      ...(type ? { type: type as import("@contract/domain/integration").ConnectorType } : {}),
      ...(provider ? { provider } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    };

    const items = await service.list(filter);
    const total = countFilter.limit === undefined && countFilter.offset === undefined
      ? items.length
      : (await service.list(countFilter)).length;

    return NextResponse.json({
      items: items.map(instanceJson),
      total,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** POST /api/integrations — crear instancia (integration.manage). */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.INTEGRATION_MANAGE);
    if (denied) return denied;

    const body = await req.json();
    const type = String(body.type ?? "REST").toUpperCase();
    const validTypes = ["REST", "WHATSAPP", "GMAIL", "GOOGLE_FORMS", "STORAGE"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Tipo de conector inválido: ${type}` }, { status: 400 });
    }
    if (type === "WHATSAPP") {
      if (!String(body.provider ?? "whatsapp-cloud")) {
        return NextResponse.json({ error: "Indica el proveedor del conector" }, { status: 400 });
      }
      if (!String((body.config as Record<string, unknown>)?.phoneNumberId ?? "").trim()) {
        return NextResponse.json({ error: "Falta el phoneNumberId de WhatsApp Business" }, { status: 400 });
      }
    }
    const service = await getIntegrationService();
    const created = await service.create({
      type: type as import("@contract/domain/integration").ConnectorType,
      provider: body.provider,
      name: body.name,
      description: body.description,
      config: body.config ?? {},
      credentials: body.credentials,
    });

    return NextResponse.json(instanceJson(created), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}