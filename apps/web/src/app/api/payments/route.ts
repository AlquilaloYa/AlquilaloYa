import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

/** suma `dias` a una fecha ISO local (YYYY-MM-DD) en la misma zona local. */
function sumarDias(iso: string, dias: number): string {
  const p = iso.slice(0, 10).split("-");
  const d = new Date(Number(p[0]), Number(p[1] ?? 1) - 1, Number(p[2] ?? 1));
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Filtra y normaliza la lista de vouchers adjuntos (solo JPEG dataURL). */
function normalizarVouchers(input: unknown): {
  nombre: string;
  url: string;
}[] {
  if (!Array.isArray(input)) return [];
  const out: { nombre: string; url: string }[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const nombre = (item as Record<string, unknown>).nombre;
    const url = (item as Record<string, unknown>).url;
    if (
      typeof nombre === "string" &&
      /\.(jpe?g)$/i.test(nombre) &&
      typeof url === "string" &&
      url.startsWith("data:image/jpeg")
    ) {
      out.push({ nombre, url });
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const url = new URL(req.url);
    const contractId = url.searchParams.get("contractId");

    const base = db.select().from(schema.payments);
    const rows = contractId
      ? await base.where(eq(schema.payments.contractId, contractId))
      : await base;

    return NextResponse.json(
      rows.map((p) => ({
        ...p,
        voucherUrl: contractId ? p.voucherUrl : null,
        periodo: toDateStr(p.periodo),
        fechaPago: p.fechaPago ? toDateStr(p.fechaPago) : null,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = await req.json();
    if (!body.contractId || !body.periodo) {
      return NextResponse.json(
        { error: "contractId y periodo son requeridos" },
        { status: 400 }
      );
    }
    const estadoIn = (body.estado ?? "PENDIENTE") as string;
    const vouchers = normalizarVouchers(body.vouchers);
    if (
      estadoIn === "PAGADO" &&
      vouchers.length === 0 &&
      (typeof body.voucherUrl !== "string" ||
        !body.voucherUrl.startsWith("data:image/jpeg") ||
        !(typeof body.voucherNombre === "string" &&
          /\.(jpe?g)$/i.test(body.voucherNombre)))
    ) {
      return NextResponse.json(
        { error: "El pago solo se confirma con al menos un baucher en imagen JPEG" },
        { status: 400 }
      );
    }
    const vouchersFinal =
      vouchers.length > 0
        ? vouchers
        : typeof body.voucherUrl === "string" && typeof body.voucherNombre === "string"
          ? [{ nombre: body.voucherNombre, url: body.voucherUrl }]
          : [];

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    // Morosidad: se aplica la penalidad fija de S/ 70 recién cuando el pago
    // se registra después del vencimiento más el período de indulgencia
    // (días de prórroga fijados manualmente en Cobranza).
    const { and, eq } = await import("drizzle-orm");

    const per = String(body.periodo).slice(0, 10);
    const [existente] = await db
      .select({ diasIndulgencia: schema.payments.diasIndulgencia })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.contractId, body.contractId),
          eq(schema.payments.periodo, per)
        )
      )
      .limit(1);
    const indulgencia = Number(
      body.diasIndulgencia ?? existente?.diasIndulgencia ?? 0
    );
    const penalidadEfectiva =
      estadoIn === "PAGADO" &&
      typeof body.fechaPago === "string" &&
      body.fechaPago > sumarDias(per, indulgencia)
        ? "70.00"
        : "0";

    const [row] = await db
      .insert(schema.payments)
      .values({
        contractId: body.contractId,
        periodo: per,
        monto: body.monto ?? "0",
        mantenimiento: body.mantenimiento ?? "50",
        penalidad: penalidadEfectiva,
        diasIndulgencia: indulgencia,
        estado: body.estado ?? "PENDIENTE",
        fechaPago: body.fechaPago ?? null,
        vouchers: vouchersFinal,
        voucherNombre: vouchersFinal[0]?.nombre ?? body.voucherNombre ?? null,
        voucherUrl: vouchersFinal[0]?.url ?? body.voucherUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.payments.contractId, schema.payments.periodo],
        set: {
          monto: body.monto ?? "0",
          mantenimiento: body.mantenimiento ?? "50",
          penalidad: penalidadEfectiva,
          diasIndulgencia: indulgencia,
          estado: body.estado ?? "PENDIENTE",
          fechaPago: body.fechaPago ?? null,
          vouchers: vouchersFinal,
          voucherNombre: vouchersFinal[0]?.nombre ?? body.voucherNombre ?? null,
          voucherUrl: vouchersFinal[0]?.url ?? body.voucherUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 });
    }

    return NextResponse.json(
      { ...row, periodo: toDateStr(row.periodo), fechaPago: row.fechaPago ? toDateStr(row.fechaPago) : null },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const { id, ...patch } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { sql } = await import("drizzle-orm");

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if ("estado" in patch) values.estado = patch.estado;
    if ("fechaPago" in patch) values.fechaPago = patch.fechaPago ?? null;
    if ("voucherNombre" in patch) values.voucherNombre = patch.voucherNombre ?? null;
    if ("voucherUrl" in patch) values.voucherUrl = patch.voucherUrl ?? null;
    if ("vouchers" in patch) values.vouchers = normalizarVouchers(patch.vouchers);
    if ("monto" in patch) values.monto = patch.monto;
    if ("mantenimiento" in patch) values.mantenimiento = patch.mantenimiento;
    if ("penalidad" in patch) values.penalidad = patch.penalidad;
    if ("diasIndulgencia" in patch)
      values.diasIndulgencia = Math.max(0, Math.floor(Number(patch.diasIndulgencia) || 0));

    if (values.estado === "PAGADO") {
      const [existente] = await db
        .select({
          voucherUrl: schema.payments.voucherUrl,
          voucherNombre: schema.payments.voucherNombre,
          vouchers: schema.payments.vouchers,
          periodo: schema.payments.periodo,
          fechaPago: schema.payments.fechaPago,
          diasIndulgencia: schema.payments.diasIndulgencia,
        })
        .from(schema.payments)
        .where(sql`id = ${id}`)
        .limit(1);
      const vouchers =
        Array.isArray(values.vouchers) && values.vouchers.length > 0
          ? (values.vouchers as { nombre: string; url: string }[])
          : typeof patch.voucherUrl === "string" &&
              typeof patch.voucherNombre === "string"
            ? normalizarVouchers([
                { nombre: patch.voucherNombre, url: patch.voucherUrl },
              ])
            : Array.isArray(existente?.vouchers) &&
                existente.vouchers.length > 0
              ? existente.vouchers
              : existente?.voucherUrl
                ? normalizarVouchers([
                    { nombre: existente.voucherNombre ?? "", url: existente.voucherUrl },
                  ])
                : [];
      if (vouchers.length === 0) {
        return NextResponse.json(
          { error: "El pago solo se confirma con al menos un baucher en imagen JPEG" },
          { status: 400 }
        );
      }
      values.vouchers = vouchers;
      values.voucherUrl = vouchers[0]?.url ?? null;
      values.voucherNombre = vouchers[0]?.nombre ?? null;
      const fp =
        typeof patch.fechaPago === "string"
          ? patch.fechaPago
          : existente?.fechaPago
            ? toDateStr(existente.fechaPago)
            : "";
      const per = existente ? toDateStr(existente.periodo) : "";
      const ind =
        "diasIndulgencia" in patch
          ? Math.max(0, Math.floor(Number(patch.diasIndulgencia) || 0))
          : Number(existente?.diasIndulgencia ?? 0);
      values.penalidad = fp && per && fp > sumarDias(per, ind) ? "70.00" : "0";
    }

    const [row] = await db
      .update(schema.payments)
      .set(values)
      .where(sql`id = ${id}`)
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ...row,
      periodo: toDateStr(row.periodo),
      fechaPago: row.fechaPago ? toDateStr(row.fechaPago) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
