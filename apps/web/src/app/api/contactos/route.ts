import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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
    const denied = requirePermission(auth.user.role, Permission.CLIENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const dni = new URL(req.url).searchParams.get("dni");
    const rows = await db
      .select()
      .from(schema.contacts)
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
    const denied = requirePermission(auth.user.role, Permission.CLIENT_CREATE);
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
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
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

/** DELETE /api/contactos?id= â€” elimina un contacto. */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CLIENT_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [row] = await db
      .delete(schema.contacts)
      .where(eq(schema.contacts.id, id))
      .returning({ id: schema.contacts.id });
    if (!row) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
