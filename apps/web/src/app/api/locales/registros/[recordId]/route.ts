import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import {
  isLocalModule,
  parseLocalRecord,
  withoutRecordType,
} from "@/lib/locales-records";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function validateReferences(
  dbModule: typeof import("@contract/db"),
  record: Exclude<ReturnType<typeof parseLocalRecord>, { error: string }>["value"],
) {
  const { schema } = dbModule;
  if (record.tipo === "separaciones" || record.tipo === "contratos") {
    const [contact] = await dbModule.db
      .select({ id: schema.localContacts.id })
      .from(schema.localContacts)
      .where(and(eq(schema.localContacts.id, record.contactId), eq(schema.localContacts.localId, record.localId)))
      .limit(1);
    if (!contact) return "El contacto no pertenece al local seleccionado.";
  }
  if (record.tipo === "contratos" && record.separationId) {
    const [separation] = await dbModule.db
      .select({
        id: schema.localSeparations.id,
        contactId: schema.localSeparations.contactId,
      })
      .from(schema.localSeparations)
      .where(
        and(
          eq(schema.localSeparations.id, record.separationId),
          eq(schema.localSeparations.localId, record.localId),
        ),
      )
      .limit(1);
    if (!separation) return "La separación no pertenece al local seleccionado.";
    if (separation.contactId !== record.contactId) {
      return "La separación seleccionada pertenece a otro contacto.";
    }
  }
  if (record.tipo === "adendas") {
    const [contract] = await dbModule.db
      .select({ id: schema.localContracts.id })
      .from(schema.localContracts)
      .where(
        and(
          eq(schema.localContracts.id, record.contractId),
          eq(schema.localContracts.localId, record.localId),
        ),
      )
      .limit(1);
    if (!contract) return "El contrato no pertenece al local seleccionado.";
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  try {
    if (!UUID.test(params.recordId)) {
      return NextResponse.json({ error: "Identificador de registro inválido." }, { status: 400 });
    }
    const tipo = new URL(request.url).searchParams.get("tipo");
    if (!isLocalModule(tipo)) {
      return NextResponse.json({ error: "Selecciona una sección válida." }, { status: 400 });
    }
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_UPDATE);
    if (denied) return denied;

    const input = await request.json().catch(() => null);
    const recordInput =
      typeof input === "object" && input !== null && !Array.isArray(input)
        ? { ...input, tipo }
        : input;
    const parsed = parseLocalRecord(recordInput);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const [local] = await dbModule.db
      .select({ id: dbModule.schema.locales.id })
      .from(dbModule.schema.locales)
      .where(eq(dbModule.schema.locales.id, parsed.value.localId))
      .limit(1);
    if (!local) return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
    const referenceError = await validateReferences(dbModule, parsed.value);
    if (referenceError) {
      return NextResponse.json({ error: referenceError }, { status: 400 });
    }

    const { schema } = dbModule;
    let row;
    switch (parsed.value.tipo) {
      case "contactos": {
        const values = withoutRecordType(parsed.value);
        [row] = await dbModule.db.update(schema.localContacts)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(schema.localContacts.id, params.recordId), eq(schema.localContacts.localId, values.localId)))
          .returning();
        break;
      }
      case "separaciones": {
        const values = withoutRecordType(parsed.value);
        [row] = await dbModule.db.update(schema.localSeparations)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(schema.localSeparations.id, params.recordId), eq(schema.localSeparations.localId, values.localId)))
          .returning();
        break;
      }
      case "contratos": {
        const values = withoutRecordType(parsed.value);
        [row] = await dbModule.db.update(schema.localContracts)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(schema.localContracts.id, params.recordId), eq(schema.localContracts.localId, values.localId)))
          .returning();
        break;
      }
      case "adendas": {
        const values = withoutRecordType(parsed.value);
        [row] = await dbModule.db.update(schema.localAnnexes)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(schema.localAnnexes.id, params.recordId), eq(schema.localAnnexes.localId, values.localId)))
          .returning();
        break;
      }
      case "servicios": {
        const values = withoutRecordType(parsed.value);
        [row] = await dbModule.db.update(schema.localServices)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(schema.localServices.id, params.recordId), eq(schema.localServices.localId, values.localId)))
          .returning();
        break;
      }
    }
    if (!row) return NextResponse.json({ error: "Registro no encontrado en ese local." }, { status: 404 });
    return NextResponse.json(row);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json({ error: "El código del contrato ya existe." }, { status: 409 });
    }
    console.error("[locales] update record failed", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el registro del local." },
      { status: 500 },
    );
  }
}
