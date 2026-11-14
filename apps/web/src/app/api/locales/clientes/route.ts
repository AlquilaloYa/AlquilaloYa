import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import {
  denyAdministrativeAssistantDeletion,
  requirePermission,
  requireUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const CONTRACT_STATES = ["NOTARIADO_FIRMADO", "VIGENTE", "FINALIZADO"] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { schema } = dbModule;
    const rows = await dbModule.db
      .selectDistinctOn([schema.localContracts.contactId], {
        id: schema.localContacts.id,
        localId: schema.localContracts.localId,
        contactLocalId: schema.localContacts.localId,
        codigoLocal: schema.locales.codigo,
        nombres: schema.localContacts.nombres,
        apellidos: schema.localContacts.apellidos,
        documentoIdentidad: schema.localContacts.documento,
        ruc: schema.localContacts.ruc,
        tipoPersona: schema.localContacts.tipoPersona,
        email: schema.localContacts.email,
        telefono: schema.localContacts.telefono,
        codigoPais: schema.localContacts.codigoPais,
        nacionalidad: schema.localContacts.nacionalidad,
        contractId: schema.localContracts.id,
        codigoContrato: schema.localContracts.codigo,
        fechaInicioContrato: schema.localContracts.fechaInicio,
        fechaFinContrato: schema.localContracts.fechaFin,
        contractDocumentId: schema.localContractDocuments.id,
        contractDocumentName: schema.localContractDocuments.nombre,
        contractDocumentMimeType: schema.localContractDocuments.mimeType,
      })
      .from(schema.localContracts)
      .innerJoin(
        schema.localContacts,
        eq(schema.localContracts.contactId, schema.localContacts.id),
      )
      .innerJoin(
        schema.locales,
        eq(schema.localContracts.localId, schema.locales.id),
      )
      .leftJoin(
        schema.localContractDocuments,
        and(
          eq(schema.localContractDocuments.contractId, schema.localContracts.id),
          eq(schema.localContractDocuments.tipo, "CONTRATO_FIRMADO"),
        ),
      )
      .where(
        and(
          eq(schema.localContacts.clienteActivo, true),
          inArray(schema.localContracts.estado, [...CONTRACT_STATES]),
        ),
      )
      .orderBy(
        schema.localContracts.contactId,
        desc(schema.localContracts.fechaFin),
        desc(schema.localContracts.createdAt),
        desc(schema.localContractDocuments.createdAt),
      );
    const contractIds = rows.map((client) => client.contractId);
    const annexes =
      contractIds.length === 0
        ? []
        : await dbModule.db
            .selectDistinctOn([schema.localAnnexes.contractId], {
              contractId: schema.localAnnexes.contractId,
              fecha: schema.localAnnexes.fecha,
              fechaFin: schema.localAnnexes.fechaFin,
            })
            .from(schema.localAnnexes)
            .where(
              and(
                inArray(schema.localAnnexes.contractId, contractIds),
                inArray(schema.localAnnexes.estado, [
                  "NOTARIADA_FIRMADA",
                  "VIGENTE",
                ]),
              ),
            )
            .orderBy(
              schema.localAnnexes.contractId,
              desc(schema.localAnnexes.createdAt),
            );
    const annexByContract = new Map(
      annexes.map((annex) => [annex.contractId, annex] as const),
    );

    const response = NextResponse.json(
      rows.map((client) => {
        const annex = annexByContract.get(client.contractId);
        return {
          id: client.id,
          localId: client.localId,
          contactLocalId: client.contactLocalId,
          codigoLocal: client.codigoLocal,
          nombres: client.nombres,
          apellidos: client.apellidos,
          documentoIdentidad: client.documentoIdentidad,
          ruc: client.ruc,
          tipoPersona: client.tipoPersona,
          email: client.email,
          telefono: client.telefono,
          codigoPais: client.codigoPais,
          nacionalidad: client.nacionalidad,
          codigoContrato: client.codigoContrato,
          contractDocumentId: client.contractDocumentId,
          contractDocumentName: client.contractDocumentName,
          contractDocumentMimeType: client.contractDocumentMimeType,
          fechaInicioContrato: String(client.fechaInicioContrato).slice(0, 10),
          fechaFinContrato: String(client.fechaFinContrato).slice(0, 10),
          fechaInicioAdenda: annex ? String(annex.fecha).slice(0, 10) : null,
          fechaFinAdenda: annex?.fechaFin
            ? String(annex.fechaFin).slice(0, 10)
            : null,
        };
      }),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[locales] list local clients failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los clientes de locales." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const deletionDenied = denyAdministrativeAssistantDeletion(auth.user);
    if (deletionDenied) return deletionDenied;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    if (typeof body?.id !== "string" || !UUID.test(body.id)) {
      return NextResponse.json(
        { error: "Identificador de cliente inválido." },
        { status: 400 },
      );
    }

    const [client] = await dbModule.db
      .update(dbModule.schema.localContacts)
      .set({ clienteActivo: false, updatedAt: new Date() })
      .where(
        and(
          eq(dbModule.schema.localContacts.id, body.id),
          eq(dbModule.schema.localContacts.clienteActivo, true),
        ),
      )
      .returning({ id: dbModule.schema.localContacts.id });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente local no encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, clienteActivo: false });
  } catch (error) {
    console.error("[locales] deactivate local client failed", error);
    return NextResponse.json(
      { error: "No se pudo quitar el cliente local de la lista." },
      { status: 500 },
    );
  }
}
