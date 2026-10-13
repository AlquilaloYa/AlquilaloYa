import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { parseWorkOrderMaterial } from "@/lib/work-order-materials-validation";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthorizedOrder(
  db: typeof import("@contract/db").db,
  schema: typeof import("@contract/db").schema,
  user: { id: string; role: string },
  orderId: string,
) {
  const [order] = await db
    .select()
    .from(schema.workOrders)
    .where(eq(schema.workOrders.id, orderId))
    .limit(1);
  if (!order) return { order: null, response: null };

  if (user.role === "ASISTENTE_ADMINISTRATIVO") {
    const [employee] = await db
      .select({ id: schema.hrEmployees.id })
      .from(schema.hrEmployees)
      .where(
        and(
          eq(schema.hrEmployees.userId, user.id),
          eq(schema.hrEmployees.estado, "ACTIVO"),
          isNull(schema.hrEmployees.deletedAt),
        ),
      )
      .limit(1);
    if (!employee || order.assignedEmployeeId !== employee.id) {
      return {
        order: null,
        response: NextResponse.json(
          { error: "Orden de trabajo no encontrada" },
          { status: 404 },
        ),
      };
    }
  }

  return { order, response: null };
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_READ,
    );
    if (denied) return denied;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de orden no válido" },
        { status: 400 },
      );
    }

    const { db, schema } = dbModule;
    const { order, response } = await getAuthorizedOrder(
      db,
      schema,
      auth.user,
      params.id,
    );
    if (response) return response;
    if (!order) {
      return NextResponse.json(
        { error: "Orden de trabajo no encontrada" },
        { status: 404 },
      );
    }

    const materials = await db
      .select()
      .from(schema.workOrderMaterials)
      .where(eq(schema.workOrderMaterials.workOrderId, params.id))
      .orderBy(asc(schema.workOrderMaterials.createdAt));
    return NextResponse.json(materials);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los materiales",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(
      auth.user.role,
      Permission.WORK_ORDER_MATERIAL_RECORD,
    );
    if (denied) return denied;
    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json(
        { error: "Identificador de orden no válido" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 },
      );
    }

    const parsed = parseWorkOrderMaterial(body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (!parsed.data) {
      return NextResponse.json(
        { error: "Datos de material no válidos" },
        { status: 400 },
      );
    }
    const { material, quantity, unit, unitCost, totalCost, observations } =
      parsed.data;

    const { db, schema } = dbModule;
    const { order, response } = await getAuthorizedOrder(
      db,
      schema,
      auth.user,
      params.id,
    );
    if (response) return response;
    if (!order) {
      return NextResponse.json(
        { error: "Orden de trabajo no encontrada" },
        { status: 404 },
      );
    }
    if (order.status === "COMPLETED") {
      return NextResponse.json(
        { error: "No se pueden registrar materiales en una orden finalizada" },
        { status: 409 },
      );
    }

    const now = new Date();
    const materialValues = {
      workOrderId: params.id,
      material,
      quantity,
      unit,
      unitCost,
      totalCost,
      observations,
      recordedBy: auth.user.id,
      createdAt: now,
    };
    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.workOrderMaterials)
        .values(materialValues)
        .returning();
      if (!row) {
        throw new Error("No se pudo registrar el material");
      }
      await tx.insert(schema.workOrderEvents).values({
        workOrderId: params.id,
        actorId: auth.user.id,
        actorName: auth.user.name,
        eventType: "MATERIAL_ADDED",
        fromStatus: order.status,
        toStatus: order.status,
        details: {
          materialId: row.id,
          material,
          quantity: materialValues.quantity,
          unit,
          unitCost: materialValues.unitCost,
          totalCost: materialValues.totalCost,
          observations: materialValues.observations,
        },
        createdAt: now,
      });
      return row;
    });

    return NextResponse.json(inserted, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar el material",
      },
      { status: 500 },
    );
  }
}
