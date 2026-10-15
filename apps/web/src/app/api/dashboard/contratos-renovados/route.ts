import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

interface ContratoRenovado {
  id: string;
  codigoContrato: string;
  cliente: string;
  documento: string;
  telefono: string | null;
  departamento: string | null;
  fechaFinAnterior: string;
  fechaFinNueva: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Contratos que finalizaron en el mes en curso y que fueron renovados
 * (extendidos mediante adenda). Criterio: la fecha de vencimiento anterior
 * (fechaFinAnterior) registrada en la adenda cae dentro del mes actual.
 */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { and, eq, inArray } = await import("drizzle-orm");

    const hoy = new Date();
    const inicioMes = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`;
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const finMes = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(ultimoDia)}`;

    const rows = await db
      .select({
        contractId: schema.documents.contractId,
        tipo: schema.documents.tipo,
        datosContrato: schema.contractSnapshots.datosContrato,
        codigoContrato: schema.contracts.codigoContrato,
        fechaFinContrato: schema.contracts.fechaFin,
        nombres: schema.clients.nombres,
        apellidos: schema.clients.apellidos,
        documento: schema.clients.documentoIdentidad,
        telefono: schema.clients.telefono,
        departamento: schema.departments.codigo,
      })
      .from(schema.documents)
      .leftJoin(
        schema.contractSnapshots,
        eq(schema.contractSnapshots.id, schema.documents.snapshotId)
      )
      .leftJoin(schema.contracts, eq(schema.contracts.id, schema.documents.contractId))
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId)
      )
      .where(
        and(
          inArray(schema.documents.tipo, ["ADENDA", "ADENDA_EXTENSION"]),
          eq(schema.documents.estadoGeneracion, "GENERADO")
        )
      );

    const resultado = new Map<string, ContratoRenovado>();
    for (const row of rows) {
      const datos = (row.datosContrato ?? {}) as Record<string, unknown>;
      const fechaFinAdenda =
        typeof datos.fechaFinAdenda === "string" ? String(datos.fechaFinAdenda).slice(0, 10) : "";
      const fechaFinSnapshot =
        typeof datos.fechaFin === "string" ? String(datos.fechaFin).slice(0, 10) : "";
      const fechaFinAnterior =
        typeof datos.fechaFinAnterior === "string"
          ? String(datos.fechaFinAnterior).slice(0, 10)
          : row.tipo === "ADENDA" && fechaFinAdenda > fechaFinSnapshot
            ? fechaFinSnapshot
            : "";
      const esExtensionConPlazo =
        row.tipo === "ADENDA_EXTENSION" || Boolean(fechaFinAdenda && fechaFinAnterior);
      if (!esExtensionConPlazo || !fechaFinAnterior) continue;
      if (fechaFinAnterior < inicioMes || fechaFinAnterior > finMes) continue;
      if (!row.contractId) continue;
      const contractId = String(row.contractId);
      const nombres = row.nombres == null ? "" : String(row.nombres);
      const apellidos = row.apellidos == null ? "" : String(row.apellidos);
      const fechaFinContrato =
        row.fechaFinContrato == null ? null : String(row.fechaFinContrato);

      resultado.set(contractId, {
        id: contractId,
        codigoContrato: row.codigoContrato ? String(row.codigoContrato) : "—",
        cliente: `${nombres} ${apellidos}`.trim() || "—",
        documento: row.documento ? String(row.documento) : "",
        telefono: row.telefono == null ? null : String(row.telefono),
        departamento: row.departamento == null ? null : String(row.departamento),
        fechaFinAnterior,
        fechaFinNueva: fechaFinAdenda || fechaFinContrato,
      });
    }

    const listado = [...resultado.values()].sort((a, b) =>
      a.fechaFinAnterior.localeCompare(b.fechaFinAnterior)
    );

    return NextResponse.json({ mes: inicioMes.slice(0, 7), contratos: listado });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
