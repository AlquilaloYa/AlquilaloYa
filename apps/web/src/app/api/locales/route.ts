import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { parseLocal, type LocalInput } from "@/lib/locales-validation";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    let rows = await dbModule.db
      .select()
      .from(dbModule.schema.locales)
      .orderBy(asc(dbModule.schema.locales.sede), asc(dbModule.schema.locales.codigo));
    if (new URL(request.url).searchParams.get("availableForContract") === "1") {
      const contracts = await dbModule.db
        .select({ localId: dbModule.schema.localContracts.localId })
        .from(dbModule.schema.localContracts)
        .where(inArray(dbModule.schema.localContracts.estado, [
          "BORRADOR",
          "EMITIDO",
          "NOTARIADO_FIRMADO",
          "VIGENTE",
        ]));
      const contractedLocalIds = new Set(contracts.map((contract) => contract.localId));
      rows = rows.filter((local) => !contractedLocalIds.has(local.id));
    }
    const response = NextResponse.json(rows);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[locales] list failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los locales." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_CREATE);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = parseLocal(body as LocalInput);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const [row] = await dbModule.db
      .insert(dbModule.schema.locales)
      .values(parsed.value)
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Ese código ya está asignado a otro local." },
        { status: 409 },
      );
    }
    console.error("[locales] create failed", error);
    return NextResponse.json(
      { error: "No se pudo crear el local." },
      { status: 500 },
    );
  }
}
