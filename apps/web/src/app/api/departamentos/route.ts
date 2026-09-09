import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.DEPARTMENT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { inArray } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.departments)
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
        inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE"])
      );

    function diasRestantes(fecha: string): number {
      return Math.max(0, Math.round((new Date(fecha).getTime() - hoy.getTime()) / 86_400_000));
    }

    const resultado = rows.map((d) => {
      const ocupando = ocupantes
        .filter(
          (c) =>
            c.departamentoId === d.id &&
            c.fechaInicio <= hoyISO &&
            c.fechaFin >= hoyISO
        )
        .map((c) => c.fechaFin)
        .sort();
      if (ocupando.length === 0) {
        return { ...d, disponibilidad: null };
      }
      const fin = ocupando[ocupando.length - 1] as string;
      return {
        ...d,
        disponibilidad: { disponible: false, fechaFin: fin, dias: diasRestantes(fin) },
      };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
