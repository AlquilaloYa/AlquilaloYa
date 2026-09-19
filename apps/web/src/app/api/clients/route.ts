import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq, and, inArray, desc } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.activo, true))
      .orderBy(desc(schema.clients.createdAt));

    if (rows.length === 0) {
      return NextResponse.json([]);
    }

    const clientIds = rows.map((c) => c.id);

    // Último contrato de cada cliente (por fecha de fin y creación).
    const contractsRows = await db
      .select()
      .from(schema.contracts)
      .where(inArray(schema.contracts.clienteId, clientIds));

    const ultimoPorCliente = new Map<
      string,
      (typeof contractsRows)[number]
    >();
    for (const contrato of contractsRows) {
      const previo = ultimoPorCliente.get(contrato.clienteId);
      const fechaStr = String(contrato.fechaFin ?? "");
      const previoStr = previo ? String(previo.fechaFin ?? "") : "";
      const esNuevo =
        !previo ||
        fechaStr > previoStr ||
        (fechaStr === previoStr &&
          contrato.creadoEn.getTime() > previo.creadoEn.getTime());
      if (esNuevo) ultimoPorCliente.set(contrato.clienteId, contrato);
    }

    // Adenda más reciente de cada contrato (lee fechas de su snapshot).
    const contractIds = [...ultimoPorCliente.values()].map((c) => c.id);
    const adendasRows =
      contractIds.length === 0
        ? []
        : await db
            .select({
              contractId: schema.documents.contractId,
              createdAt: schema.documents.createdAt,
              datosContrato: schema.contractSnapshots.datosContrato,
            })
            .from(schema.documents)
            .innerJoin(
              schema.contractSnapshots,
              eq(schema.documents.snapshotId, schema.contractSnapshots.id)
            )
            .where(
              and(
                inArray(schema.documents.contractId, contractIds),
                inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"])
              )
            )
            .orderBy(desc(schema.documents.createdAt));

    const contratoPorId = new Map(
      contractsRows.map((c) => [c.id, c] as const)
    );
    const adendaPorCliente = new Map<string, (typeof adendasRows)[number]>();
    for (const adenda of adendasRows) {
      const contrato = contratoPorId.get(adenda.contractId);
      if (!contrato) continue;
      if (!adendaPorCliente.has(contrato.clienteId)) {
        adendaPorCliente.set(contrato.clienteId, adenda);
      }
    }

    return NextResponse.json(
      rows.map((c) => {
        const contrato = ultimoPorCliente.get(c.id);
        const adenda = adendaPorCliente.get(c.id);
        const datos = (adenda?.datosContrato ?? {}) as Record<string, unknown>;
        return {
          id: c.id,
          nombres: c.nombres,
          apellidos: c.apellidos,
          documentoIdentidad: c.documentoIdentidad,
          ruc: c.ruc,
          tipoPersona: c.tipoPersona,
          email: c.email,
          telefono: c.telefono,
          codigoPais: c.codigoPais,
          codigoDepartamento: c.codigoDepartamento,
          domicilio: c.domicilio,
          nacionalidad: c.nacionalidad,
          activo: c.activo,
          fechaFinContrato: contrato?.fechaFin
            ? String(contrato.fechaFin).slice(0, 10)
            : null,
          fechaInicioAdenda: datos.fechaInicioAdenda
            ? String(datos.fechaInicioAdenda).slice(0, 10)
            : null,
          fechaFinAdenda: datos.fechaFinAdenda
            ? String(datos.fechaFinAdenda).slice(0, 10)
            : null,
        };
      })
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
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { id, ...patch } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const values: Record<string, unknown> = {};
    if ("codigoDepartamento" in patch) {
      values.codigoDepartamento = patch.codigoDepartamento ?? null;
    }
    if ("nombres" in patch) values.nombres = patch.nombres;
    if ("apellidos" in patch) values.apellidos = patch.apellidos ?? null;
    if ("email" in patch) values.email = patch.email ?? null;
    if ("telefono" in patch) values.telefono = patch.telefono ?? null;
    if ("codigoPais" in patch) values.codigoPais = patch.codigoPais ?? "51";
    if ("domicilio" in patch) values.domicilio = patch.domicilio ?? null;
    if ("nacionalidad" in patch) values.nacionalidad = patch.nacionalidad ?? null;
    if ("activo" in patch) values.activo = patch.activo;

    const row = await db
      .update(schema.clients)
      .set(values)
      .where(sql`id = ${id}`)
      .returning();

    return NextResponse.json(row[0]);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const row = await db
      .update(schema.clients)
      .set({ activo: false, updatedAt: new Date() })
      .where(sql`id = ${id}`)
      .returning();

    if (row.length === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, activo: false });
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
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const body = await req.json();
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };

    const row = await db
      .insert(schema.clients)
      .values({
        nombres: body.nombres,
        apellidos: body.apellidos ?? null,
        documentoIdentidad: body.documentoIdentidad,
        ruc: body.ruc ?? null,
        tipoPersona: body.tipoPersona,
        email: body.email ?? null,
        telefono: body.telefono ?? null,
        codigoPais: body.codigoPais ?? "51",
        codigoDepartamento: body.codigoDepartamento ?? null,
        domicilio: body.domicilio ?? null,
        nacionalidad: body.nacionalidad ?? null,
        activo: body.activo !== false,
      })
      .returning();

    return NextResponse.json(row[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}