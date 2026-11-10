import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { evaluarDiasExtras, MAX_DIAS_EXTRAS } from "@/lib/dias-extras-policy";
import { sincronizarTareasContrato } from "@/lib/tareas-contrato";

export const dynamic = "force-dynamic";

function dateString(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
}

function limaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

class DiasExtrasRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const rows = await db
      .select({
        id: schema.diasExtras.id,
        contractId: schema.diasExtras.contractId,
        codigoContrato: schema.contracts.codigoContrato,
        clienteId: schema.contracts.clienteId,
        clienteNombre: schema.clients.nombres,
        clienteApellidos: schema.clients.apellidos,
        departamentoNombre: schema.departments.nombre,
        dias: schema.diasExtras.dias,
        monto: schema.diasExtras.monto,
        fechaFinPeriodo: schema.diasExtras.fechaFinPeriodo,
        estado: schema.diasExtras.estado,
        fechaPago: schema.diasExtras.fechaPago,
        creadoPor: schema.diasExtras.creadoPor,
        createdAt: schema.diasExtras.createdAt,
      })
      .from(schema.diasExtras)
      .innerJoin(schema.contracts, eq(schema.contracts.id, schema.diasExtras.contractId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId))
      .orderBy(desc(schema.diasExtras.createdAt));

    return NextResponse.json(rows.map((row) => ({
      ...row,
      fechaFinPeriodo: dateString(row.fechaFinPeriodo),
      fechaPago: row.fechaPago ? dateString(row.fechaPago) : null,
      createdAt: row.createdAt.toISOString(),
    })));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los días extras" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await req.json().catch(() => null)) as { contractId?: unknown; dias?: unknown } | null;
    if (!body || typeof body.contractId !== "string") {
      return NextResponse.json({ error: "Selecciona un contrato válido." }, { status: 400 });
    }
    const dias = Number(body.dias);
    const policy = evaluarDiasExtras(dias);
    if (!policy.valido) {
      return NextResponse.json({ error: "Los días extras deben ser un número entero mayor a cero." }, { status: 400 });
    }
    if (policy.requiereAdenda) {
      return NextResponse.json(
        { error: "Más de 7 días deben gestionarse mediante una Adenda con cobro proporcional.", href: "/adendas" },
        { status: 400 },
      );
    }

    const { db, schema } = dbModule;
    const contractId = body.contractId;
    const { and: andWhere, eq: equal } = await import("drizzle-orm");
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select({
          id: schema.contracts.id,
          fechaFin: schema.contracts.fechaFin,
          estado: schema.contracts.estado,
        })
        .from(schema.contracts)
        .where(equal(schema.contracts.id, contractId))
        .for("update");
      if (!contract) throw new DiasExtrasRequestError("Contrato no encontrado.", 404);
      if (!["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE"].includes(contract.estado)) {
        throw new DiasExtrasRequestError(
          "Solo se pueden registrar días extras para contratos vigentes.",
          409,
        );
      }

      const fechaFinPeriodo = dateString(contract.fechaFin);
      if (!fechaFinPeriodo || fechaFinPeriodo < limaToday()) {
        throw new DiasExtrasRequestError(
          "El período del contrato ya terminó; gestiona la extensión mediante una Adenda.",
          409,
        );
      }

      const existing = await tx
        .select({ dias: schema.diasExtras.dias })
        .from(schema.diasExtras)
        .where(andWhere(
          equal(schema.diasExtras.contractId, contract.id),
          equal(schema.diasExtras.fechaFinPeriodo, fechaFinPeriodo),
        ));
      const totalDias = existing.reduce((sum, row) => sum + row.dias, 0);
      const currentPeriodPolicy = evaluarDiasExtras(dias, totalDias);
      if (!currentPeriodPolicy.permitido) {
        throw new DiasExtrasRequestError(
          `Para este período solo quedan ${MAX_DIAS_EXTRAS - totalDias} día(s) disponibles. Si necesita más, utiliza Adendas.`,
          409,
        );
      }

      const [row] = await tx
        .insert(schema.diasExtras)
        .values({
          contractId: contract.id,
          dias,
          monto: currentPeriodPolicy.monto.toFixed(2),
          fechaFinPeriodo,
          creadoPor: auth.user.name || auth.user.email,
        })
        .returning();
      if (!row) throw new Error("No se pudo registrar el cargo de días extras.");
      return { contract, row, fechaFinPeriodo };
    });
    const { contract, row, fechaFinPeriodo } = result;

    await recordAdminAction(dbModule, auth.user, {
      action: "EXTRA_RENTAL_DAYS_CREATED",
      module: "CONTRACTS",
      entityType: "DIAS_EXTRAS",
      entityId: row.id,
      current: { contractId: contract.id, dias, monto: row.monto, fechaFinPeriodo },
    });
    let taskSyncWarning: string | null = null;
    try {
      await sincronizarTareasContrato(contract.id);
    } catch (error) {
      taskSyncWarning =
        "Los días extras se registraron, pero no se pudo actualizar el aviso de check-out. Actualiza la tarea manualmente o vuelve a intentar la sincronización.";
      console.error("No se pudo sincronizar el check-out tras registrar días extras", {
        contractId: contract.id,
        error,
      });
    }
    return NextResponse.json(
      taskSyncWarning ? { ...row, taskSyncWarning } : row,
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron registrar los días extras" },
      { status: error instanceof DiasExtrasRequestError ? error.status : 500 },
    );
  }
}
