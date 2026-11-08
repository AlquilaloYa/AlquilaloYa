import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import type { ContractSnapshot } from "@contract/domain/snapshot";
import { generateAdendaPdf, generateContractPdf } from "@/lib/pdf/generate-pdf";
import { renderContractHtml } from "@/lib/pdf/render-contract-html";
import { renderAdendaHtml } from "@/lib/pdf/render-adenda-html";
import { deleteObject, isStorageConfigured, uploadObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const BUCKET = "local-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type WorkflowType = "separaciones" | "contratos" | "adendas";
type WorkflowAction = "emitir" | "completar" | "extender";

export async function POST(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  let uploadedKey: string | null = null;
  try {
    if (!UUID.test(params.recordId)) {
      return NextResponse.json({ error: "Identificador de registro inválido." }, { status: 400 });
    }
    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    const accion = url.searchParams.get("accion");
    if (
      !["separaciones", "contratos", "adendas"].includes(tipo ?? "") ||
      !["emitir", "completar", "extender"].includes(accion ?? "")
    ) {
      return NextResponse.json({ error: "La acción solicitada no es válida." }, { status: 400 });
    }
    const recordType = tipo as WorkflowType;
    const action = accion as WorkflowAction;
    if (
      (recordType === "separaciones" && action === "emitir") ||
      (recordType !== "separaciones" && action === "extender")
    ) {
      return NextResponse.json({ error: "La acción no corresponde al tipo de registro." }, { status: 400 });
    }

    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule;
    let updated: { id: string; localId: string; estado: string } | undefined;
    if (recordType === "separaciones" && action === "extender") {
      const [separation] = await db.select({
        id: schema.localSeparations.id,
        localId: schema.localSeparations.localId,
        estado: schema.localSeparations.estado,
        garantiaExtendida: schema.localSeparations.garantiaExtendida,
        fecha: schema.localSeparations.fecha,
        diasTiempo: schema.localSeparations.diasTiempo,
        fechaLimiteManual: schema.localSeparations.fechaLimiteManual,
      }).from(schema.localSeparations)
        .where(eq(schema.localSeparations.id, params.recordId)).limit(1);
      if (!separation) return NextResponse.json({ error: "Separación no encontrada." }, { status: 404 });
      if (separation.estado === "CANCELADA" || separation.garantiaExtendida) {
        return NextResponse.json({ error: "La garantía no se puede extender en el estado actual." }, { status: 409 });
      }
      const deadline = separation.fechaLimiteManual ?? new Date(`${separation.fecha}T12:00:00.000Z`);
      if (!separation.fechaLimiteManual) {
        deadline.setUTCDate(deadline.getUTCDate() + separation.diasTiempo);
      }
      if (Date.now() > deadline.getTime()) {
        return NextResponse.json({ error: "No se puede extender una separación vencida." }, { status: 409 });
      }
      const [document] = await db.select({ id: schema.localContractDocuments.id })
        .from(schema.localContractDocuments)
        .where(and(
          eq(schema.localContractDocuments.separationId, separation.id),
          eq(schema.localContractDocuments.tipo, "VOUCHER_GARANTIA_EXTENDIDA"),
        )).limit(1);
      if (!document) {
        return NextResponse.json({ error: "Adjunta el voucher de garantía extendida antes de activarla." }, { status: 409 });
      }
      [updated] = await db.update(schema.localSeparations)
        .set({
          garantiaExtendida: true,
          fechaGarantiaExtendida: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.localSeparations.id, separation.id),
          eq(schema.localSeparations.localId, separation.localId),
        ))
        .returning({
          id: schema.localSeparations.id,
          localId: schema.localSeparations.localId,
          estado: schema.localSeparations.estado,
        });
    } else if (recordType === "separaciones" && action === "completar") {
      const [separation] = await db.select({
        id: schema.localSeparations.id,
        localId: schema.localSeparations.localId,
        estado: schema.localSeparations.estado,
        fecha: schema.localSeparations.fecha,
        diasTiempo: schema.localSeparations.diasTiempo,
        fechaLimiteManual: schema.localSeparations.fechaLimiteManual,
        garantiaExtendida: schema.localSeparations.garantiaExtendida,
      }).from(schema.localSeparations)
        .where(eq(schema.localSeparations.id, params.recordId)).limit(1);
      if (!separation) return NextResponse.json({ error: "Separación no encontrada." }, { status: 404 });
      if (separation.estado !== "PENDIENTE") {
        return NextResponse.json({ error: "Solo se pueden confirmar separaciones pendientes." }, { status: 409 });
      }
      const deadline = separation.fechaLimiteManual ?? new Date(`${separation.fecha}T12:00:00.000Z`);
      if (!separation.fechaLimiteManual) {
        deadline.setUTCDate(deadline.getUTCDate() + separation.diasTiempo);
      }
      if (separation.garantiaExtendida) deadline.setTime(deadline.getTime() + 120 * 60 * 60 * 1000);
      if (Date.now() > deadline.getTime()) {
        return NextResponse.json({ error: "La separación está vencida y ya no se puede confirmar." }, { status: 409 });
      }
      const [document] = await db.select({ id: schema.localContractDocuments.id })
        .from(schema.localContractDocuments)
        .where(and(
          eq(schema.localContractDocuments.separationId, separation.id),
          eq(schema.localContractDocuments.tipo, "VOUCHER_SEPARACION"),
        )).limit(1);
      if (!document) {
        return NextResponse.json({ error: "Adjunta el voucher de separación antes de confirmarla." }, { status: 409 });
      }
      [updated] = await db.update(schema.localSeparations)
        .set({ estado: "CONFIRMADA", updatedAt: new Date() })
        .where(and(
          eq(schema.localSeparations.id, separation.id),
          eq(schema.localSeparations.localId, separation.localId),
        ))
        .returning({
          id: schema.localSeparations.id,
          localId: schema.localSeparations.localId,
          estado: schema.localSeparations.estado,
        });
    } else if (recordType === "contratos") {
      const [contract] = await db.select({
        id: schema.localContracts.id,
        localId: schema.localContracts.localId,
        estado: schema.localContracts.estado,
        separationId: schema.localContracts.separationId,
        codigo: schema.localContracts.codigo,
        plantillaVersionId: schema.localContracts.plantillaVersionId,
        montoCanon: schema.localContracts.montoCanon,
        depositoGarantia: schema.localContracts.depositoGarantia,
        mantenimiento: schema.localContracts.mantenimiento,
        fechaInicio: schema.localContracts.fechaInicio,
        fechaFin: schema.localContracts.fechaFin,
        contactId: schema.localContacts.id,
        nombres: schema.localContacts.nombres,
        apellidos: schema.localContacts.apellidos,
        documento: schema.localContacts.documento,
        telefono: schema.localContacts.telefono,
        email: schema.localContacts.email,
        localCodigo: schema.locales.codigo,
        localNombre: schema.locales.nombre,
        localSede: schema.locales.sede,
        localAreaM2: schema.locales.areaM2,
        plantillaHtml: schema.templateVersions.contenido,
      }).from(schema.localContracts)
        .innerJoin(schema.localContacts, eq(schema.localContacts.id, schema.localContracts.contactId))
        .innerJoin(schema.locales, eq(schema.locales.id, schema.localContracts.localId))
        .leftJoin(schema.templateVersions, eq(schema.templateVersions.id, schema.localContracts.plantillaVersionId))
        .where(eq(schema.localContracts.id, params.recordId)).limit(1);
      if (!contract) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });

      if (action === "emitir") {
        if (contract.estado !== "BORRADOR") {
          return NextResponse.json({ error: "Solo se pueden emitir contratos en borrador." }, { status: 409 });
        }
        if (!contract.plantillaVersionId || !contract.plantillaHtml) {
          return NextResponse.json({ error: "La plantilla seleccionada no tiene un documento HTML publicado." }, { status: 409 });
        }
        if (!isStorageConfigured()) {
          return NextResponse.json({ error: "El almacenamiento privado no está configurado." }, { status: 503 });
        }
        const [separation] = contract.separationId
          ? await db.select({
              tipo: schema.localSeparations.tipoSeparacion,
              monto: schema.localSeparations.monto,
              fecha: schema.localSeparations.fecha,
            }).from(schema.localSeparations)
              .where(eq(schema.localSeparations.id, contract.separationId)).limit(1)
          : [];
        const snapshot: ContractSnapshot = {
          id: contract.id,
          codigoContrato: contract.codigo,
          plantillaVersionId: contract.plantillaVersionId,
          datosCliente: {
            id: contract.contactId,
            nombres: contract.nombres,
            apellidos: contract.apellidos,
            documentoIdentidad: contract.documento,
            email: contract.email,
            telefono: contract.telefono,
            domicilio: "",
            nacionalidad: "Peruano(a)",
          },
          datosDepartamento: {
            id: contract.localId,
            codigo: contract.localCodigo,
            nombre: contract.localNombre,
            sede: contract.localSede,
            piso: contract.localSede,
            areaM2: contract.localAreaM2,
            personaPago: contract.localSede,
          },
          datosContrato: {
            codigoContrato: contract.codigo,
            montoCanonMensual: contract.montoCanon,
            depositoGarantia: contract.depositoGarantia,
            mantenimiento: contract.mantenimiento,
            fechaInicio: contract.fechaInicio,
            fechaFin: contract.fechaFin,
            separacionDetalle: separation ? {
              tipo: separation.tipo,
              monto: separation.monto,
              fecha: separation.fecha,
            } : null,
            copiaDni: [],
            muebleriaItems: [],
            mascotasItems: [],
            datosArrendatario: {
              nombre: contract.nombres,
              apellido: contract.apellidos,
              documentoIdentidad: contract.documento,
              email: contract.email,
              telefono: contract.telefono,
            },
          },
          clausulas: [],
          anexos: [],
          inmutable: false,
          emitidoEn: null,
          createdAt: new Date().toISOString(),
        };
        const documentoHtml = renderContractHtml(snapshot, contract.plantillaHtml);
        const pdf = await generateContractPdf(snapshot, contract.plantillaHtml);
        const documentId = randomUUID();
        const stored = await uploadObject(
          `${contract.localId}/documentos/contratos/${contract.id}/${documentId}.pdf`,
          pdf.bytes,
          pdf.mimeType,
          BUCKET,
        );
        uploadedKey = stored.key;
        const updatedContract = await db.transaction(async (tx) => {
          const [next] = await tx.update(schema.localContracts)
            .set({ estado: "EMITIDO", documentoHtml, updatedAt: new Date() })
            .where(and(
              eq(schema.localContracts.id, contract.id),
              eq(schema.localContracts.estado, "BORRADOR"),
            ))
            .returning({
              id: schema.localContracts.id,
              localId: schema.localContracts.localId,
              estado: schema.localContracts.estado,
            });
          if (!next) return null;
          await tx.insert(schema.localContractDocuments).values({
            id: documentId,
            localId: contract.localId,
            contractId: contract.id,
            tipo: "CONTRATO_EMITIDO",
            nombre: pdf.filename,
            storageKey: stored.key,
            mimeType: pdf.mimeType,
            sizeBytes: stored.sizeBytes,
            uploadedBy: auth.user.name || auth.user.email,
          });
          return next;
        });
        if (!updatedContract) {
          await deleteObject(stored.key, BUCKET);
          uploadedKey = null;
          return NextResponse.json({ error: "El contrato cambió de estado y no pudo emitirse." }, { status: 409 });
        }
        uploadedKey = null;
        updated = updatedContract;
      } else {
        if (contract.estado !== "EMITIDO") {
          return NextResponse.json({ error: "El contrato debe estar emitido antes de completar sus documentos." }, { status: 409 });
        }
        const documents = await db.select({ tipo: schema.localContractDocuments.tipo })
          .from(schema.localContractDocuments)
          .where(and(
            eq(schema.localContractDocuments.contractId, contract.id),
            inArray(schema.localContractDocuments.tipo, [
              "VOUCHER_GARANTIA",
              "VOUCHER_PRIMERA_MENSUALIDAD",
              "CONTRATO_FIRMADO",
            ]),
          ));
        const uploaded = new Set(documents.map((document) => document.tipo));
        if (!["VOUCHER_GARANTIA", "VOUCHER_PRIMERA_MENSUALIDAD", "CONTRATO_FIRMADO"].every((type) => uploaded.has(type))) {
          return NextResponse.json({
            error: "Adjunta el voucher de garantía, el voucher de primera mensualidad y el contrato firmado.",
          }, { status: 409 });
        }
        [updated] = await db.update(schema.localContracts)
          .set({ estado: "NOTARIADO_FIRMADO", updatedAt: new Date() })
          .where(eq(schema.localContracts.id, contract.id))
          .returning({
            id: schema.localContracts.id,
            localId: schema.localContracts.localId,
            estado: schema.localContracts.estado,
          });
      }
    } else {
      const [annex] = await db.select({
        id: schema.localAnnexes.id,
        localId: schema.localAnnexes.localId,
        estado: schema.localAnnexes.estado,
        contractId: schema.localAnnexes.contractId,
        numero: schema.localAnnexes.numero,
        descripcion: schema.localAnnexes.descripcion,
        fecha: schema.localAnnexes.fecha,
        tipoAdenda: schema.localAnnexes.tipoAdenda,
        fechaFinAdenda: schema.localAnnexes.fechaFin,
        montoCanonAdenda: schema.localAnnexes.montoCanon,
        contratoCodigo: schema.localContracts.codigo,
        plantillaVersionId: schema.localContracts.plantillaVersionId,
        montoCanon: schema.localContracts.montoCanon,
        depositoGarantia: schema.localContracts.depositoGarantia,
        mantenimiento: schema.localContracts.mantenimiento,
        fechaInicio: schema.localContracts.fechaInicio,
        fechaFin: schema.localContracts.fechaFin,
        contactoId: schema.localContacts.id,
        nombres: schema.localContacts.nombres,
        apellidos: schema.localContacts.apellidos,
        documento: schema.localContacts.documento,
        email: schema.localContacts.email,
        telefono: schema.localContacts.telefono,
        localCodigo: schema.locales.codigo,
        localNombre: schema.locales.nombre,
        localSede: schema.locales.sede,
        localAreaM2: schema.locales.areaM2,
      }).from(schema.localAnnexes)
        .innerJoin(schema.localContracts, eq(schema.localContracts.id, schema.localAnnexes.contractId))
        .innerJoin(schema.localContacts, eq(schema.localContacts.id, schema.localContracts.contactId))
        .innerJoin(schema.locales, eq(schema.locales.id, schema.localAnnexes.localId))
        .where(eq(schema.localAnnexes.id, params.recordId)).limit(1);
      if (!annex) return NextResponse.json({ error: "Adenda no encontrada." }, { status: 404 });

      if (action === "emitir") {
        if (annex.estado !== "BORRADOR") {
          return NextResponse.json({ error: "Solo se pueden emitir adendas en borrador." }, { status: 409 });
        }
        if (!isStorageConfigured()) {
          return NextResponse.json({ error: "El almacenamiento privado no está configurado." }, { status: 503 });
        }
        const snapshot: ContractSnapshot = {
          id: annex.id,
          codigoContrato: annex.contratoCodigo,
          plantillaVersionId: annex.plantillaVersionId ?? annex.contractId,
          datosCliente: {
            id: annex.contactoId,
            nombres: annex.nombres,
            apellidos: annex.apellidos,
            documentoIdentidad: annex.documento,
            email: annex.email,
            telefono: annex.telefono,
            domicilio: "",
            nacionalidad: "Peruano(a)",
          },
          datosDepartamento: {
            id: annex.localId,
            codigo: annex.localCodigo,
            nombre: annex.localNombre,
            sede: annex.localSede,
            piso: annex.localSede,
            areaM2: annex.localAreaM2,
            personaPago: annex.localSede,
          },
          datosContrato: {
            codigoContrato: annex.contratoCodigo,
            montoCanonMensual: annex.montoCanonAdenda ?? annex.montoCanon,
            depositoGarantia: annex.depositoGarantia,
            mantenimiento: annex.mantenimiento,
            fechaInicio: annex.fechaInicio,
            fechaFin: annex.fechaFin,
            fechaInicioAdenda: annex.fecha,
            fechaFinAdenda: annex.fechaFinAdenda ?? annex.fechaFin,
            fechaFinAnterior: annex.fechaFin,
            fechaFinNueva: annex.fechaFinAdenda ?? annex.fechaFin,
            tipoDocumento: annex.tipoAdenda,
            numeroAdenda: annex.numero,
            titulo: annex.tipoAdenda === "ADENDA_EXTENSION" ? "ADENDA DE EXTENSIÓN" : "ADENDA",
          },
          clausulas: [],
          anexos: [{ versionId: annex.id, contenido: annex.descripcion }],
          inmutable: false,
          emitidoEn: null,
          createdAt: new Date().toISOString(),
        };
        const documentoHtml = await renderAdendaHtml(snapshot);
        const pdf = await generateAdendaPdf(snapshot);
        const documentId = randomUUID();
        const stored = await uploadObject(
          `${annex.localId}/documentos/adendas/${annex.id}/${documentId}.pdf`,
          pdf.bytes,
          pdf.mimeType,
          BUCKET,
        );
        uploadedKey = stored.key;
        const updatedAnnex = await db.transaction(async (tx) => {
          const [next] = await tx.update(schema.localAnnexes)
            .set({ estado: "EMITIDA", documentoHtml, updatedAt: new Date() })
            .where(and(
              eq(schema.localAnnexes.id, annex.id),
              eq(schema.localAnnexes.estado, "BORRADOR"),
            ))
            .returning({
              id: schema.localAnnexes.id,
              localId: schema.localAnnexes.localId,
              estado: schema.localAnnexes.estado,
            });
          if (!next) return null;
          await tx.insert(schema.localContractDocuments).values({
            id: documentId,
            localId: annex.localId,
            annexId: annex.id,
            tipo: "ADENDA_EMITIDA",
            nombre: pdf.filename,
            storageKey: stored.key,
            mimeType: pdf.mimeType,
            sizeBytes: stored.sizeBytes,
            uploadedBy: auth.user.name || auth.user.email,
          });
          return next;
        });
        if (!updatedAnnex) {
          await deleteObject(stored.key, BUCKET);
          uploadedKey = null;
          return NextResponse.json({ error: "La adenda cambió de estado y no pudo emitirse." }, { status: 409 });
        }
        uploadedKey = null;
        updated = updatedAnnex;
      } else {
        if (annex.estado !== "EMITIDA") {
          return NextResponse.json({ error: "La adenda debe estar emitida antes de completar sus documentos." }, { status: 409 });
        }
        const [document] = await db.select({ id: schema.localContractDocuments.id })
          .from(schema.localContractDocuments)
          .where(and(
            eq(schema.localContractDocuments.annexId, annex.id),
            eq(schema.localContractDocuments.tipo, "ADENDA_FIRMADA"),
          )).limit(1);
        if (!document) {
          return NextResponse.json({ error: "Adjunta la adenda firmada antes de completarla." }, { status: 409 });
        }
        [updated] = await db.update(schema.localAnnexes)
          .set({ estado: "NOTARIADA_FIRMADA", updatedAt: new Date() })
          .where(eq(schema.localAnnexes.id, annex.id))
          .returning({
            id: schema.localAnnexes.id,
            localId: schema.localAnnexes.localId,
            estado: schema.localAnnexes.estado,
          });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteObject(uploadedKey, BUCKET);
      } catch (cleanupError) {
        console.error("[locales] orphan emitted contract cleanup failed", cleanupError);
      }
    }
    console.error("[locales] workflow transition failed", error);
    return NextResponse.json({ error: "No se pudo actualizar el estado del registro." }, { status: 500 });
  }
}
