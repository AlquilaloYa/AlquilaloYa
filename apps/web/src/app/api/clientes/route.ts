import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

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
    const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.activo, true), isNull(schema.clients.eliminadoEn)))
      .orderBy(schema.clients.nombres);

    // Respaldo: si el cliente no tiene teléfono propio, se usa el del contacto
    // ligado por documento de identidad (la sincronización solo corre al
    // guardar el contacto, así que puede quedar desactualizado).
    const documentos = [
      ...new Set(
        rows
          .map((row) => row.documentoIdentidad?.trim() ?? "")
          .filter((value) => value.length > 0),
      ),
    ];
    const contactos = documentos.length
      ? await db
          .select({
            dni: schema.contacts.dni,
            telefono: schema.contacts.telefono,
            codigoPais: schema.contacts.codigoPais,
          })
          .from(schema.contacts)
          .where(
            and(
              inArray(schema.contacts.dni, documentos),
              isNull(schema.contacts.eliminadoEn),
            ),
          )
          .orderBy(desc(schema.contacts.createdAt))
      : [];
    const contactoPorDni = new Map<
      string,
      { telefono: string; codigoPais: string }
    >();
    for (const contacto of contactos) {
      const telefono = (contacto.telefono ?? "").trim();
      const dni = contacto.dni?.trim() ?? "";
      if (!telefono || !dni || contactoPorDni.has(dni)) continue;
      contactoPorDni.set(dni, {
        telefono,
        codigoPais: contacto.codigoPais ?? "51",
      });
    }

    return NextResponse.json(
      rows.map((row) => {
        if ((row.telefono ?? "").trim()) return row;
        const contacto = contactoPorDni.get(row.documentoIdentidad?.trim() ?? "");
        if (!contacto) return row;
        return {
          ...row,
          telefono: contacto.telefono,
          codigoPais: contacto.codigoPais,
        };
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}