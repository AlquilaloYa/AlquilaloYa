import { NextResponse } from "next/server";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import {
  isLocalModule,
  parseLocalRecord,
  validateLocalContractCode,
  validateLocalSeparationAmount,
  withoutRecordType,
} from "@/lib/locales-records";
import { requirePermission, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;

function effectiveSeparationDeadline(separation: {
  fecha: string;
  diasTiempo: number;
  fechaLimiteManual: Date | null;
  garantiaExtendida: boolean;
}) {
  const deadline = separation.fechaLimiteManual
    ? new Date(separation.fechaLimiteManual)
    : new Date(`${separation.fecha}T12:00:00.000Z`);
  if (!separation.fechaLimiteManual) {
    deadline.setUTCDate(deadline.getUTCDate() + separation.diasTiempo);
  }
  if (separation.garantiaExtendida) {
    deadline.setTime(deadline.getTime() + 120 * 60 * 60 * 1000);
  }
  return deadline.toISOString();
}

async function validateReferences(
  dbModule: typeof import("@contract/db"),
  record: Exclude<ReturnType<typeof parseLocalRecord>, { error: string }>["value"],
  excludeContractId?: string,
) {
  const { schema } = dbModule;
  if (record.tipo === "separaciones") {
    const [contact] = await dbModule.db
      .select({ id: schema.localContacts.id })
      .from(schema.localContacts)
      .where(and(eq(schema.localContacts.id, record.contactId), eq(schema.localContacts.localId, record.localId)))
      .limit(1);
    if (!contact) return "El contacto no pertenece al local seleccionado.";
    return null;
  }
  if (record.tipo === "contratos") {
    const [local] = await dbModule.db
      .select({ id: schema.locales.id, codigo: schema.locales.codigo })
      .from(schema.locales)
      .where(eq(schema.locales.id, record.localId))
      .limit(1);
    if (!local) return "Local no encontrado.";
    const codigoError = validateLocalContractCode(record.codigo, local.codigo);
    if (codigoError) return codigoError;
    const [existingContract] = await dbModule.db
      .select({ id: schema.localContracts.id })
      .from(schema.localContracts)
      .where(and(
        eq(schema.localContracts.localId, record.localId),
        inArray(schema.localContracts.estado, ["BORRADOR", "EMITIDO", "NOTARIADO_FIRMADO", "VIGENTE"]),
      ))
      .limit(1);
    if (existingContract && existingContract.id !== excludeContractId) {
      return "Este local ya tiene un contrato; solo se pueden crear contratos para locales disponibles.";
    }
    if (record.plantillaVersionId) {
      const [templateVersion] = await dbModule.db
        .select({ id: schema.templateVersions.id })
        .from(schema.templateVersions)
        .where(
          and(
            eq(schema.templateVersions.id, record.plantillaVersionId),
            eq(schema.templateVersions.publicada, true),
          ),
        )
        .limit(1);
      if (!templateVersion) return "Selecciona una versión publicada de plantilla.";
    }
    const [contact] = await dbModule.db
      .select({ id: schema.localContacts.id })
      .from(schema.localContacts)
      .where(and(eq(schema.localContacts.id, record.contactId), eq(schema.localContacts.localId, record.localId)))
      .limit(1);
    if (!contact) return "El contacto no pertenece al local seleccionado.";
    if (record.separationId) {
      const [separation] = await dbModule.db
        .select({
          id: schema.localSeparations.id,
          contactId: schema.localSeparations.contactId,
          estado: schema.localSeparations.estado,
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
      if (separation.estado !== "CONFIRMADA") {
        return "Solo puedes vincular una separación confirmada a un contrato.";
      }
    }
  }
  if (record.tipo === "adendas") {
    const [contract] = await dbModule.db
      .select({
        id: schema.localContracts.id,
        fechaFin: schema.localContracts.fechaFin,
        estado: schema.localContracts.estado,
      })
      .from(schema.localContracts)
      .where(
        and(
          eq(schema.localContracts.id, record.contractId),
          eq(schema.localContracts.localId, record.localId),
        ),
      )
      .limit(1);
    if (!contract) return "El contrato no pertenece al local seleccionado.";
    if (!["NOTARIADO_FIRMADO", "VIGENTE"].includes(contract.estado)) {
      return "Solo puedes crear adendas para contratos firmados y notariados.";
    }
    if (record.tipoAdenda === "ADENDA_EXTENSION" && record.fechaFin && record.fechaFin <= contract.fechaFin) {
      return "La nueva fecha de término debe ser posterior al fin vigente del contrato.";
    }
    return null;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    const localId = url.searchParams.get("localId");
    if (!isLocalModule(tipo)) {
      return NextResponse.json({ error: "Selecciona una sección válida." }, { status: 400 });
    }
    if (!localId || !UUID.test(localId)) {
      return NextResponse.json({ error: "Identificador de local inválido." }, { status: 400 });
    }
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit))
      : 50;
    const offset = Number.isInteger(requestedOffset)
      ? Math.min(1_000_000, Math.max(0, requestedOffset))
      : 0;
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { schema } = dbModule;
    let rows;
    let total = 0;
    switch (tipo) {
      case "contactos":
        rows = await dbModule.db.select({
          id: schema.localContacts.id,
          localId: schema.localContacts.localId,
          nombres: schema.localContacts.nombres,
          apellidos: schema.localContacts.apellidos,
          documento: schema.localContacts.documento,
          tipoPersona: schema.localContacts.tipoPersona,
          ruc: schema.localContacts.ruc,
          telefono: schema.localContacts.telefono,
          codigoPais: schema.localContacts.codigoPais,
          email: schema.localContacts.email,
          domicilio: schema.localContacts.domicilio,
          nacionalidad: schema.localContacts.nacionalidad,
          contactoEmergencia: schema.localContacts.contactoEmergencia,
          mascotas: schema.localContacts.mascotas,
          mascotasItems: schema.localContacts.mascotasItems,
          copiaDniCount: sql<number>`jsonb_array_length(${schema.localContacts.copiaDni})`,
          copiaBoletasCount: sql<number>`jsonb_array_length(${schema.localContacts.copiaBoletas})`,
          copiaAntecedentesCount: sql<number>`jsonb_array_length(${schema.localContacts.copiaAntecedentes})`,
          createdAt: schema.localContacts.createdAt,
          updatedAt: schema.localContacts.updatedAt,
        }).from(schema.localContacts)
          .where(eq(schema.localContacts.localId, localId))
          .orderBy(desc(schema.localContacts.createdAt))
          .limit(limit).offset(offset);
        total = (await dbModule.db.select({ count: count() }).from(schema.localContacts)
          .where(eq(schema.localContacts.localId, localId)))[0]?.count ?? 0;
        break;
      case "separaciones":
        rows = (await dbModule.db.select().from(schema.localSeparations)
          .where(eq(schema.localSeparations.localId, localId))
          .orderBy(desc(schema.localSeparations.createdAt))
          .limit(limit).offset(offset)).map((separation) => {
            const fechaLimiteManual = effectiveSeparationDeadline(separation);
            const vencida = Date.now() > new Date(fechaLimiteManual).getTime();
            const estadoVista = separation.estado === "PENDIENTE" && vencida
              ? ["500", "FLUCTUANTE"].includes(separation.tipoSeparacion) && !separation.garantiaExtendida
                ? "PERDIDA"
                : "VENCIDA"
              : separation.estado;
            return { ...separation, fechaLimiteManual, estadoVista };
          });
        total = (await dbModule.db.select({ count: count() }).from(schema.localSeparations)
          .where(eq(schema.localSeparations.localId, localId)))[0]?.count ?? 0;
        break;
      case "contratos":
        rows = await dbModule.db.select().from(schema.localContracts)
          .where(eq(schema.localContracts.localId, localId))
          .orderBy(desc(schema.localContracts.createdAt))
          .limit(limit).offset(offset);
        total = (await dbModule.db.select({ count: count() }).from(schema.localContracts)
          .where(eq(schema.localContracts.localId, localId)))[0]?.count ?? 0;
        break;
      case "adendas":
        rows = await dbModule.db.select().from(schema.localAnnexes)
          .where(eq(schema.localAnnexes.localId, localId))
          .orderBy(desc(schema.localAnnexes.createdAt))
          .limit(limit).offset(offset);
        total = (await dbModule.db.select({ count: count() }).from(schema.localAnnexes)
          .where(eq(schema.localAnnexes.localId, localId)))[0]?.count ?? 0;
        break;
      case "servicios":
        rows = await dbModule.db.select().from(schema.localServices)
          .where(eq(schema.localServices.localId, localId))
          .orderBy(asc(schema.localServices.nombre))
          .limit(limit).offset(offset);
        total = (await dbModule.db.select({ count: count() }).from(schema.localServices)
          .where(eq(schema.localServices.localId, localId)))[0]?.count ?? 0;
        break;
    }
    const response = NextResponse.json({ records: rows, total, limit, offset });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[locales] list records failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los registros del local." },
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

    const input = await request.json().catch(() => null);
    const parsed = parseLocalRecord(input);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (
      (parsed.value.tipo === "separaciones" && parsed.value.estado !== "PENDIENTE") ||
      (parsed.value.tipo === "contratos" && parsed.value.estado !== "BORRADOR") ||
      (parsed.value.tipo === "adendas" && parsed.value.estado !== "BORRADOR")
    ) {
      return NextResponse.json(
        { error: "El estado inicial del registro debe mantenerse. Usa las acciones del flujo para cambiarlo." },
        { status: 400 },
      );
    }
    if (parsed.value.tipo === "separaciones" && parsed.value.garantiaExtendida) {
      return NextResponse.json(
        { error: "La garantía extendida solo se activa mediante el flujo con su voucher." },
        { status: 400 },
      );
    }
    if (parsed.value.tipo === "contratos" && !parsed.value.plantillaVersionId) {
      return NextResponse.json({ error: "Selecciona una plantilla publicada para el contrato." }, { status: 400 });
    }
    const { schema } = dbModule;
    const [local] = await dbModule.db.select({
      id: schema.locales.id,
      precioAlquiler: schema.locales.precioAlquiler,
    })
      .from(schema.locales)
      .where(eq(schema.locales.id, parsed.value.localId))
      .limit(1);
    if (!local) return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });
    if (parsed.value.tipo === "separaciones") {
      const amountError = validateLocalSeparationAmount(parsed.value, local.precioAlquiler);
      if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });
    }

    const referenceError = await validateReferences(dbModule, parsed.value);
    if (referenceError) {
      return NextResponse.json({ error: referenceError }, { status: 400 });
    }

    let row;
    switch (parsed.value.tipo) {
      case "contactos":
        {
          const values = withoutRecordType(parsed.value);
          row = (await dbModule.db.insert(schema.localContacts).values(values).returning())[0];
        }
        break;
      case "separaciones":
        {
          const values = withoutRecordType(parsed.value);
          row = (await dbModule.db.insert(schema.localSeparations).values(values).returning())[0];
        }
        break;
      case "contratos":
        {
          const values = withoutRecordType(parsed.value);
          row = (await dbModule.db.insert(schema.localContracts).values(values).returning())[0];
        }
        break;
      case "adendas":
        {
          const values = withoutRecordType(parsed.value);
          row = (await dbModule.db.insert(schema.localAnnexes).values(values).returning())[0];
        }
        break;
      case "servicios":
        {
          const values = withoutRecordType(parsed.value);
          row = (await dbModule.db.insert(schema.localServices).values(values).returning())[0];
        }
        break;
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "Este local ya tiene un contrato activo." },
        { status: 409 },
      );
    }
    console.error("[locales] create record failed", error);
    return NextResponse.json(
      { error: "No se pudo guardar el registro del local." },
      { status: 500 },
    );
  }
}
