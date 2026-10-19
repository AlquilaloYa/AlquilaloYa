import { NextResponse } from "next/server";
import type { ContractSnapshot } from "@contract/domain/snapshot";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { renderContractHtml } from "@/lib/pdf/render-contract-html";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/**
 * POST /api/contracts/:id/document/preview
 * Renderiza el HTML del contrato (con los datos y marcadores reemplazados)
 * para previsualizar el documento antes de guardarlo.
 *
 * Body: { html: string }
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { html?: string };
    const html = (body.html ?? "").toString();
    if (!html.trim()) {
      return NextResponse.json(
        { error: "El documento HTML no puede estar vacío" },
        { status: 400 }
      );
    }

    const { contractRepository } = await buildContractServices();
    const contract = await contractRepository.findWithRelations(params.id);
    if (!contract) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Contrato emitido: usa el snapshot vigente (datos congelados).
    // Borrador: arma una instantánea con los datos vivos del contrato.
    const snapshot: ContractSnapshot =
      contract.snapshot ?? {
        id: "preview",
        codigoContrato: contract.codigoContrato,
        plantillaVersionId: contract.plantillaVersionId,
        datosCliente: contract.cliente as unknown as Record<string, unknown>,
        datosDepartamento:
          contract.departamento as unknown as Record<string, unknown>,
        datosContrato: {
          codigoContrato: contract.codigoContrato,
          montoCanonMensual: contract.montoCanonMensual,
          depositoGarantia: contract.depositoGarantia,
          mantenimiento: contract.mantenimiento,
          fechaInicio: contract.fechaInicio,
          fechaFin: contract.fechaFin,
          separacionDetalle: contract.separacionDetalle,
          copiaDni: contract.copiaDni,
          muebleriaItems: contract.muebleriaItems ?? [],
          mascotasItems: contract.mascotasItems ?? [],
          datosArrendatario: contract.datosArrendatario,
        },
        clausulas: [],
        anexos: [],
        documentoHtml: html,
        inmutable: false,
        emitidoEn: null,
        createdAt: new Date().toISOString(),
      };

    return NextResponse.json({ html: renderContractHtml(snapshot, html) });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
