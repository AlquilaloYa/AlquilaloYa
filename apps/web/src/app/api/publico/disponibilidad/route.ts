import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** OPTIONS /api/publico/disponibilidad — preflight CORS para webs externas. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function edificioDeCodigo(codigo: string): string | null {
  if (codigo.startsWith("BEN")) return "Benavides 2195";
  if (codigo.startsWith("ANG")) return "Angamos 170";
  return null;
}

/**
 * GET /api/publico/disponibilidad — listado público de departamentos
 * disponibles para consumo desde una web externa (sin sesión).
 *
 * - Solo devuelve datos públicos: código, nombre, piso y precio.
 * - Reglas: activo, sin contrato vigente (hoy), sin estado manual de
 *   mantenimiento/bloqueado y sin contrato finalizado pendiente.
 * - No expone ocupantes, teléfonos, id internos ni datos sensibles.
 */
export async function GET() {
  try {
    const dbModule = await import("@contract/db");
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq, inArray } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.activo, true))
      .orderBy(schema.departments.nombre, schema.departments.numero);

    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);

    const ocupantes = await db
      .select({
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .where(
        inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"])
      );

    const ultimoFinPorDepartamento = new Map<string, string>();
    for (const c of ocupantes) {
      if (!c.departamentoId) continue;
      const prev = ultimoFinPorDepartamento.get(c.departamentoId);
      if (!prev || c.fechaFin > prev) {
        ultimoFinPorDepartamento.set(c.departamentoId, c.fechaFin);
      }
    }

    const items = rows
      .filter((d) => !d.codigo.startsWith("EXT"))
      .map((d) => {
        if (d.estadoManual === "BLOQUEADO" || d.estadoManual === "MANTENIMIENTO") {
          return null;
        }
        const ocupando = ocupantes.some(
          (c) =>
            c.departamentoId === d.id &&
            c.fechaInicio <= hoyISO &&
            c.fechaFin >= hoyISO
        );
        if (ocupando) return null;
        const ultimoFin = ultimoFinPorDepartamento.get(d.id);
        if (ultimoFin && ultimoFin < hoyISO) return null;
        return {
          codigo: d.codigo,
          nombre: d.nombre,
          numero: d.numero,
          piso: d.piso,
          precio: Number(d.precio),
          edificio: edificioDeCodigo(d.codigo),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const edificios = [...new Set(items.map((i) => i.edificio).filter(Boolean))];

    return NextResponse.json(
      {
        items,
        edificios,
        total: items.length,
        generadoEn: hoy.toISOString(),
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}