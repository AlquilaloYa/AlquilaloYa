import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
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
    if (
      estadoIn === "PAGADO" &&
      (typeof body.voucherUrl !== "string" ||
        !body.voucherUrl.startsWith("data:image/jpeg") ||
        !(typeof body.voucherNombre === "string" &&
          /\.(jpe?g)$/i.test(body.voucherNombre)))
    ) {
      return NextResponse.json(
        { error: "El pago solo se confirma con un baucher en imagen JPEG" },
        { status: 400 }
      );
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    // Morosidad: si el pago se registró después del día de vencimiento
    // (ventana de 24 h de ese día), se aplica la penalidad fija de S/ 70.
    const penalidadEfectiva =
      estadoIn === "PAGADO" &&
      typeof body.fechaPago === "string" &&
      body.fechaPago > String(body.periodo).slice(0, 10)
        ? "70.00"
        : "0";

    const [row] = await db
      .insert(schema.payments)
      .values({
        contractId: body.contractId,
        periodo: body.periodo,
        monto: body.monto ?? "0",
        mantenimiento: body.mantenimiento ?? "50",
        penalidad: penalidadEfectiva,
        estado: body.estado ?? "PENDIENTE",
        fechaPago: body.fechaPago ?? null,
        voucherNombre: body.voucherNombre ?? null,
        voucherUrl: body.voucherUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.payments.contractId, schema.payments.periodo],
        set: {
          monto: body.monto ?? "0",
          mantenimiento: body.mantenimiento ?? "50",
          penalidad: penalidadEfectiva,
          estado: body.estado ?? "PENDIENTE",
          fechaPago: body.fechaPago ?? null,
          voucherNombre: body.voucherNombre ?? null,
          voucherUrl: body.voucherUrl ?? null,
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
    if ("monto" in patch) values.monto = patch.monto;
    if ("mantenimiento" in patch) values.mantenimiento = patch.mantenimiento;
    if ("penalidad" in patch) values.penalidad = patch.penalidad;

    if (values.estado === "PAGADO") {
      const [existente] = await db
        .select({
          voucherUrl: schema.payments.voucherUrl,
          voucherNombre: schema.payments.voucherNombre,
          periodo: schema.payments.periodo,
          fechaPago: schema.payments.fechaPago,
        })
        .from(schema.payments)
        .where(sql`id = ${id}`)
        .limit(1);
      const url =
        typeof patch.voucherUrl === "string"
          ? patch.voucherUrl
          : existente?.voucherUrl ?? "";
      const nombre =
        typeof patch.voucherNombre === "string"
          ? patch.voucherNombre
          : existente?.voucherNombre ?? "";
      if (
        !url.startsWith("data:image/jpeg") ||
        !/\.(jpe?g)$/i.test(nombre)
      ) {
        return NextResponse.json(
          { error: "El pago solo se confirma con un baucher en imagen JPEG" },
          { status: 400 }
        );
      }
      const fp =
        typeof patch.fechaPago === "string"
          ? patch.fechaPago
          : existente?.fechaPago
            ? toDateStr(existente.fechaPago)
            : "";
      const per = existente ? toDateStr(existente.periodo) : "";
      values.penalidad = fp && per && fp > per ? "70.00" : "0";
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
