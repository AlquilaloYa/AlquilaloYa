import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { ensureContractPdfDocument } from "@/lib/documents";
import { sincronizarTareasContrato } from "@/lib/tareas-contrato";
import type { UpdateDraftInput } from "@contract/domain";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { contractRepository } = await buildContractServices();
    const contract = await contractRepository.findWithRelations(params.id);
    if (!contract) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(contract);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await request.json()) as UpdateDraftInput;
    const { contractService } = await buildContractServices({
      userId: auth.user.id,
      name: auth.user.name,
    });
    const updated = await contractService.updateDraft(params.id, body);
    try {
      await sincronizarTareasContrato(params.id);
    } catch {
      /* las tareas automaticas no deben bloquear la edicion del contrato */
    }
    return NextResponse.json(updated);
} catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/contracts/:id
 * Elimina definitivamente un contrato CANCELADO y sus dependencias
 * (pagos, tareas automáticas, documentos, snapshot, cláusulas/anexos).
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_CANCEL);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const [contract] = await db
      .select({ id: schema.contracts.id, estado: schema.contracts.estado, snapshotId: schema.contracts.snapshotId })
      .from(schema.contracts)
      .where(eq(schema.contracts.id, params.id))
      .limit(1);
    if (!contract) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }
    if (contract.estado !== "CANCELADO") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar contratos cancelados" },
        { status: 400 }
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.payments).where(eq(schema.payments.contractId, params.id));
      await tx.delete(schema.tasks).where(eq(schema.tasks.origenContratoId, params.id));
      await tx.delete(schema.documents).where(eq(schema.documents.contractId, params.id));
      await tx.delete(schema.contracts).where(eq(schema.contracts.id, params.id));
      if (contract.snapshotId) {
        await tx.delete(schema.contractSnapshots).where(eq(schema.contractSnapshots.id, contract.snapshotId));
      }
    });

    return NextResponse.json({ ok: true, id: params.id });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contracts/:id  body: { action }
 * Ejecuta una transición de estado usando el servicio de dominio (máquina de estados).
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;

    const body = (await request.json()) as { action: string };
    const { contractService, contractRepository } = await buildContractServices({
      userId: auth.user.id,
      name: auth.user.name,
    });

    switch (body.action) {
      case "requestEmission": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_EMIT);
        if (denied) return denied;
        const c = await contractService.requestEmission(params.id);
        return NextResponse.json(c);
      }
      case "emit": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_EMIT);
        if (denied) return denied;
        const contract = await contractRepository.findWithRelations(params.id);
        if (!contract) {
          return NextResponse.json({ error: "No encontrado" }, { status: 404 });
        }
        const emitted = await contractService.emitContract(contract);
        // Fase 4: registra el PDF del contrato en storage (best-effort; la
        // emisión ya está hecha y no debe fallar por el documento).
        try {
          const { db, schema } = dbModule as {
            db: typeof import("@contract/db").db;
            schema: typeof import("@contract/db").schema;
          };
          const doc = await ensureContractPdfDocument(
            db,
            schema,
            contractRepository,
            params.id
          );
          return NextResponse.json({
            ...emitted,
            documentoPdf: doc
              ? {
                  id: doc.id,
                  filename: doc.filename,
                  almacenado: Boolean(doc.storageKey),
                }
              : null,
          });
        } catch {
          return NextResponse.json({ ...emitted, documentoPdf: null });
        }
      }
      case "requestFirma": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_SIGN);
        if (denied) return denied;
        const c = await contractService.requestSignature(params.id);
        return NextResponse.json(c);
      }
      case "firmar": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_SIGN);
        if (denied) return denied;
        const c = await contractService.signContract(params.id);
        return NextResponse.json(c);
      }
      case "notariar": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
        if (denied) return denied;
        const { db, schema } = dbModule as {
          db: typeof import("@contract/db").db;
          schema: typeof import("@contract/db").schema;
        };
        const { and, eq, inArray } = await import("drizzle-orm");
        const documents = await db
          .select({ tipo: schema.documents.tipo })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.contractId, params.id),
              inArray(schema.documents.tipo, ["VOUCHER_MENSUALIDAD", "CONTRATO_NOTARIADO"])
            )
          );
        const uploadedTypes = new Set(documents.map((document) => document.tipo));
        const missing = [
          !uploadedTypes.has("VOUCHER_MENSUALIDAD") ? "voucher de pago" : null,
          !uploadedTypes.has("CONTRATO_NOTARIADO") ? "contrato notariado" : null,
        ].filter(Boolean);
        if (missing.length > 0) {
          return NextResponse.json(
            { error: `Para notariar debes adjuntar: ${missing.join(" y ")}.` },
            { status: 400 }
          );
        }
        const c = await contractService.notariarContract(params.id);
        return NextResponse.json(c);
      }
      case "cancelar": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_CANCEL);
        if (denied) return denied;
        const c = await contractService.cancelContract(params.id);
        return NextResponse.json(c);
      }
      case "resolver": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
        if (denied) return denied;
        const data = body as { action: string; motivo?: string };
        const motivo = (data.motivo ?? "").trim();
        if (!motivo) {
          return NextResponse.json(
            { error: "Debe indicar el motivo de la resolución" },
            { status: 400 }
          );
        }
        const resolved = await contractService.resolveContract(params.id, motivo);
        // Cierra las cuotas futuras no pagadas del contrato resuelto.
        const { db, schema } = dbModule as {
          db: typeof import("@contract/db").db;
          schema: typeof import("@contract/db").schema;
        };
        const { sql } = await import("drizzle-orm");
        await db
          .update(schema.payments)
          .set({ estado: "CANCELADO", updatedAt: new Date() })
          .where(
            sql`${schema.payments.contractId} = ${params.id} AND ${schema.payments.estado} <> 'PAGADO' AND ${schema.payments.periodo} >= CURRENT_DATE`
          );
        return NextResponse.json(resolved);
      }
      case "renovar": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_UPDATE);
        if (denied) return denied;
        const data = body as {
          action: string;
          nuevaFechaInicio?: string;
          nuevaFechaFin?: string;
        };
        if (!data.nuevaFechaInicio || !data.nuevaFechaFin) {
          return NextResponse.json(
            { error: "Debe indicar las nuevas fechas del contrato renovado" },
            { status: 400 }
          );
        }
        const nuevo = await contractService.renewContract(params.id, {
          nuevaFechaInicio: data.nuevaFechaInicio,
          nuevaFechaFin: data.nuevaFechaFin,
        });
        return NextResponse.json({ ...nuevo, esRenovacion: true });
      }
      case "snapshot": {
        const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
        if (denied) return denied;
        const contract = await contractRepository.findWithRelations(params.id);
        if (!contract) {
          return NextResponse.json({ error: "No encontrado" }, { status: 404 });
        }
        return NextResponse.json(contract.snapshot ?? null);
      }
      default:
        return NextResponse.json(
          { error: `Acción no soportada: ${body.action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}