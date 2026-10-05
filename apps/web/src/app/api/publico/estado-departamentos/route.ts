import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** OPTIONS /api/publico/estado-departamentos — preflight CORS para webs externas. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function edificioDeCodigo(codigo: string): string | null {
  if (codigo.startsWith("BEN")) return "Benavides 2195";
  if (codigo.startsWith("ANG")) return "Angamos 170";
  return null;
}

/**
 * Estados que consume la web de monoespacios. Deben coincidir con el enum
 * `availability_enum` de esa base.
 */
type EstadoDepartamento = "disponible" | "ocupado" | "mantenimiento" | "bloqueado";

/**
 * GET /api/publico/estado-departamentos — estado de TODOS los departamentos
 * activos para consumo desde una web externa (sin sesión).
 *
 * A diferencia de `/api/publico/disponibilidad`, que solo lista los que se
 * pueden publicar, este endpoint devuelve también los ocupados, en
 * mantenimiento y bloqueados, para que la web pueda pintar su etiqueta.
 *
 * Prioridad del estado (un departamento con contrato vigente está ocupado,
 * nunca bloqueado a mano):
 *   1. contrato vigente hoy  -> ocupado      (disponibleDesde = fechaFin)
 *   2. estado_manual MANTENIMIENTO -> mantenimiento (reparación corta)
 *   3. estado_manual BLOQUEADO -> bloqueado      (reparación larga)
 *   4. estado_manual DISPONIBLE -> disponible   (decisión manual explícita)
 *   5. en cualquier otro caso -> disponible
 *
 * No expone ocupantes, teléfonos, id internos ni datos sensibles.
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

    const contratos = await db
      .select({
        departamentoId: schema.contracts.departamentoId,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .where(
        inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"])
      );

    const items = rows
      .filter((d) => !d.codigo.startsWith("EXT"))
      .map((d): {
        codigo: string;
        estado: EstadoDepartamento;
        disponibleDesde: string | null;
        edificio: string | null;
      } => {
        const vigente = contratos.find(
          (c) =>
            c.departamentoId === d.id &&
            c.fechaInicio <= hoyISO &&
            c.fechaFin >= hoyISO
        );

        if (vigente) {
          return {
            codigo: d.codigo,
            estado: "ocupado",
            // La web usa esta fecha para la cuenta regresiva en días.
            disponibleDesde: vigente.fechaFin,
            edificio: edificioDeCodigo(d.codigo),
          };
        }

        if (d.estadoManual === "MANTENIMIENTO") {
          return {
            codigo: d.codigo,
            estado: "mantenimiento",
            disponibleDesde: null,
            edificio: edificioDeCodigo(d.codigo),
          };
        }

        if (d.estadoManual === "BLOQUEADO") {
          return {
            codigo: d.codigo,
            estado: "bloqueado",
            disponibleDesde: null,
            edificio: edificioDeCodigo(d.codigo),
          };
        }

        // Marcado a mano como disponible: cae igual que el final de la función
        // (disponible, sin fecha), pero se deja explícito para que quede claro
        // en el código que es una decisión del usuario y no un descarte.
        if (d.estadoManual === "DISPONIBLE") {
          return {
            codigo: d.codigo,
            estado: "disponible",
            disponibleDesde: null,
            edificio: edificioDeCodigo(d.codigo),
          };
        }

        return {
          codigo: d.codigo,
          estado: "disponible",
          disponibleDesde: null,
          edificio: edificioDeCodigo(d.codigo),
        };
      });

    return NextResponse.json(
      { items, total: items.length, generadoEn: hoy.toISOString() },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}