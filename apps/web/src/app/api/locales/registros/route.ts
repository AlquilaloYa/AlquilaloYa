import { NextResponse } from "next/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
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
const MAX_PAGE_SIZE = 100;

async function validateReferences(
  dbModule: typeof import("@contract/db"),
  record: Exclude<ReturnType<typeof parseLocalRecord>, { error: string }>["value"],
) {
  const { schema } = dbModule;
  if (record.tipo === "separaciones") {
    const [contact] = await dbModule.db
      .select({ id: schema.localContacts.id })
      .from(schema.localContacts)
      .where(and(eq(schema.localContacts.id, record.contactId), eq(schema.localContacts.localId, record.localId)))
      .limit(1);
    return contact ? null : "El contacto no pertenece al local seleccionado.";
  }
  if (record.tipo === "contratos") {
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
    return contract ? null : "El contrato no pertenece al local seleccionado.";
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
        rows = await dbModule.db.select().from(schema.localContacts)
          .where(eq(schema.localContacts.localId, localId))
          .orderBy(desc(schema.localContacts.createdAt))
          .limit(limit).offset(offset);
        total = (await dbModule.db.select({ count: count() }).from(schema.localContacts)
          .where(eq(schema.localContacts.localId, localId)))[0]?.count ?? 0;
        break;
      case "separaciones":
        rows = await dbModule.db.select().from(schema.localSeparations)
          .where(eq(schema.localSeparations.localId, localId))
          .orderBy(desc(schema.localSeparations.createdAt))
          .limit(limit).offset(offset);
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
    const { schema } = dbModule;
    const [local] = await dbModule.db.select({ id: schema.locales.id })
      .from(schema.locales)
      .where(eq(schema.locales.id, parsed.value.localId))
      .limit(1);
    if (!local) return NextResponse.json({ error: "Local no encontrado." }, { status: 404 });

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
      return NextResponse.json({ error: "El código del contrato ya existe." }, { status: 409 });
    }
    console.error("[locales] create record failed", error);
    return NextResponse.json(
      { error: "No se pudo guardar el registro del local." },
      { status: 500 },
    );
  }
}
