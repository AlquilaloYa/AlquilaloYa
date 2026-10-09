import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  nombre?: string;
  apellido?: string;
  tipoPersona?: string;
  dni?: string;
  ruc?: string | null;
  email?: string;
telefono?: string;
  codigoPais?: string | null;
 domicilio?: string | null;
  nacionalidad?: string | null;
  contactoEmergencia?: unknown;
  mascotas?: boolean;
  mascotasItems?: string[];
  copiaDni?: unknown[];
  copiaBoletas?: unknown[];
  copiaAntecedentes?: unknown[];
};

function toView(r: {
  id: string;
  nombre: string;
  apellido: string;
  tipoPersona: string;
  dni: string;
  ruc: string | null;
email: string;
  telefono: string | null;
  codigoPais: string | null;
 domicilio: string | null;
  nacionalidad: string | null;
  contactoEmergencia: unknown;
  mascotas: boolean;
  mascotasItems: unknown;
  copiaDni: unknown;
  copiaBoletas: unknown;
  copiaAntecedentes: unknown;
  createdAt: Date;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    apellido: r.apellido,
    tipoPersona: r.tipoPersona,
    dni: r.dni,
    ruc: r.ruc,
    email: r.email,
telefono: r.telefono ?? "",
    codigoPais: r.codigoPais ?? "51",
    domicilio: r.domicilio ?? "",
    nacionalidad: r.nacionalidad ?? "",
    contactoEmergencia: r.contactoEmergencia ?? null,
    mascotas: r.mascotas,
    mascotasItems: Array.isArray(r.mascotasItems) ? r.mascotasItems : [],
    copiaDni: Array.isArray(r.copiaDni) ? r.copiaDni : [],
    copiaBoletas: Array.isArray(r.copiaBoletas) ? r.copiaBoletas : [],
    copiaAntecedentes: Array.isArray(r.copiaAntecedentes) ? r.copiaAntecedentes : [],
    createdAt: r.createdAt?.toISOString?.() ?? null,
  };
}

/** GET /api/contactos â€” listado (?dni= filtra por documento). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const dni = new URL(req.url).searchParams.get("dni");
    const rows = await db
      .select()
      .from(schema.contacts)
      .where(isNull(schema.contacts.eliminadoEn))
      .orderBy(desc(schema.contacts.createdAt));
    const filtered = dni ? rows.filter((r) => r.dni === dni) : rows;
    return NextResponse.json(filtered.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/contactos â€” crea un contacto. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_CREATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body;
    if (!body.nombre?.trim()) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    const [row] = await db
      .insert(schema.contacts)
      .values({
        nombre: body.nombre.trim(),
        apellido: (body.apellido ?? "").trim(),
        tipoPersona: body.tipoPersona ?? "NATURAL",
        dni: (body.dni ?? "").trim(),
ruc: body.ruc || null,
        email: (body.email ?? "").trim(),
        telefono: body.telefono || null,
        codigoPais: body.codigoPais || "51",
        domicilio: body.domicilio || null,
        nacionalidad: body.nacionalidad || null,
        contactoEmergencia: body.contactoEmergencia ?? null,
        mascotas: Boolean(body.mascotas),
        mascotasItems: body.mascotasItems ?? [],
        copiaDni: body.copiaDni ?? [],
        copiaBoletas: body.copiaBoletas ?? [],
        copiaAntecedentes: body.copiaAntecedentes ?? [],
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear el contacto" }, { status: 500 });
    }
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/contactos â€” actualiza por id. */
export async function PUT(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body & { id: string };
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [row] = await db
      .update(schema.contacts)
      .set({
        nombre: (body.nombre ?? "").trim(),
        apellido: (body.apellido ?? "").trim(),
        tipoPersona: body.tipoPersona ?? "NATURAL",
        dni: (body.dni ?? "").trim(),
ruc: body.ruc || null,
        email: (body.email ?? "").trim(),
        telefono: body.telefono || null,
        codigoPais: body.codigoPais || "51",
        domicilio: body.domicilio || null,
        nacionalidad: body.nacionalidad || null,
        contactoEmergencia: body.contactoEmergencia ?? null,
        mascotas: Boolean(body.mascotas),
        mascotasItems: body.mascotasItems ?? [],
        copiaDni: body.copiaDni ?? [],
        copiaBoletas: body.copiaBoletas ?? [],
        copiaAntecedentes: body.copiaAntecedentes ?? [],
        updatedAt: new Date(),
      })
      .where(eq(schema.contacts.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/contactos?id= â€” borra el contacto y todo lo generado a partir de el. */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const { and, eq, inArray, isNull, like, or } = await import("drizzle-orm");
    const ahora = new Date();

    const resultado = await db.transaction(async (tx) => {
      const [contacto] = await tx
        .select()
        .from(schema.contacts)
        .where(and(eq(schema.contacts.id, id), isNull(schema.contacts.eliminadoEn)))
        .limit(1);
      if (!contacto) return { error: "Contacto no encontrado", status: 404 } as const;

      const claves = [contacto.dni, contacto.ruc]
        .map((v) => (v ?? "").trim())
        .filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

      // 1. Clientes ligados al contacto por DNI/RUC.
      const clientes = claves.length
        ? await tx
            .select({ id: schema.clients.id })
            .from(schema.clients)
            .where(inArray(schema.clients.documentoIdentidad, claves))
        : [];
      const clienteIds = clientes.map((c) => c.id);

      // 2. Contratos del contacto: pre-contrato y contrato final.
      const contratos = clienteIds.length
        ? await tx
            .select({
              id: schema.contracts.id,
              codigo: schema.contracts.codigoContrato,
              snapshotId: schema.contracts.snapshotId,
            })
            .from(schema.contracts)
            .where(inArray(schema.contracts.clienteId, clienteIds))
        : [];
      const contratoIds = contratos.map((c) => c.id);
      const codigos = contratos.map((c) => c.codigo);

      // 3. Documentos del contrato (PDF final) y de sus adendas.
      const docs = contratoIds.length
        ? await tx
            .select({ id: schema.documents.id, snapshotId: schema.documents.snapshotId })
            .from(schema.documents)
            .where(inArray(schema.documents.contractId, contratoIds))
        : [];

      // 4. Snapshots: el congelado del contrato, los de cada documento y los de
      //    las adendas, que comparten el código base con sufijo "-ADD-N".
      const snapshotIds = new Set<string>();
      for (const c of contratos) if (c.snapshotId) snapshotIds.add(c.snapshotId);
      for (const d of docs) if (d.snapshotId) snapshotIds.add(d.snapshotId);
      const prefijosAdenda = codigos.map((c) =>
        like(schema.contractSnapshots.codigoContrato, `${c}-ADD-%`)
      );
      const condicionAdenda = prefijosAdenda.length ? or(...prefijosAdenda) : undefined;
      const adendas = condicionAdenda
        ? await tx
            .select({ id: schema.contractSnapshots.id })
            .from(schema.contractSnapshots)
            .where(condicionAdenda)
        : [];
      for (const a of adendas) snapshotIds.add(a.id);
      const todosLosSnapshots = [...snapshotIds];

      // 5. Separaciones (uni/dep) del contacto.
      const separaciones = await tx
        .update(schema.separations)
        .set({ eliminadoEn: ahora, updatedAt: ahora })
        .where(
          and(eq(schema.separations.contactoId, id), isNull(schema.separations.eliminadoEn))
        )
        .returning({ id: schema.separations.id });

      // 6. Cliente: ademas se desactiva para que no aparezca en los selectores.
      const filasClientes = clienteIds.length
        ? await tx
            .update(schema.clients)
            .set({ eliminadoEn: ahora, activo: false, updatedAt: ahora })
            .where(inArray(schema.clients.id, clienteIds))
            .returning({ id: schema.clients.id })
        : [];

      // 7. Contratos (pre-contrato y contrato final).
      const filasContratos = contratoIds.length
        ? await tx
            .update(schema.contracts)
            .set({ eliminadoEn: ahora, actualizadoEn: ahora })
            .where(inArray(schema.contracts.id, contratoIds))
            .returning({ id: schema.contracts.id })
        : [];

      // 8. Documentos: contratos finales y adendas.
      const filasDocs = docs.length
        ? await tx
            .update(schema.documents)
            .set({ eliminadoEn: ahora, updatedAt: ahora })
            .where(inArray(schema.documents.id, docs.map((d) => d.id)))
            .returning({ id: schema.documents.id })
        : [];

      // 9. Snapshots de contrato final y de adendas.
      const filasSnapshots = todosLosSnapshots.length
        ? await tx
            .update(schema.contractSnapshots)
            .set({ eliminadoEn: ahora })
            .where(inArray(schema.contractSnapshots.id, todosLosSnapshots))
            .returning({ id: schema.contractSnapshots.id })
        : [];

      // 10. Pagos generados por esos contratos.
      const filasPagos = contratoIds.length
        ? await tx
            .update(schema.payments)
            .set({ eliminadoEn: ahora, updatedAt: ahora })
            .where(inArray(schema.payments.contractId, contratoIds))
            .returning({ id: schema.payments.id })
        : [];

      // 11. El contacto al final, cuando todo lo demas ya quedo marcado.
      await tx
        .update(schema.contacts)
        .set({ eliminadoEn: ahora, updatedAt: ahora })
        .where(eq(schema.contacts.id, id));

      return {
        resumen: {
          separaciones: separaciones.length,
          clientes: filasClientes.length,
          contratos: filasContratos.length,
          adendas: adendas.length,
          documentos: filasDocs.length,
          snapshots: filasSnapshots.length,
          pagos: filasPagos.length,
        },
      } as const;
    });

    if ("error" in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...resultado.resumen });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
