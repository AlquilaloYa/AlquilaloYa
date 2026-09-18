import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
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
    const { desc, eq } = await import("drizzle-orm");

    const [cliente] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, params.id))
      .limit(1);

    if (!cliente) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const [contrato] = await db
      .select({
        id: schema.contracts.id,
        clienteId: schema.contracts.clienteId,
        codigoContrato: schema.contracts.codigoContrato,
        montoCanonMensual: schema.contracts.montoCanonMensual,
        depositoGarantia: schema.contracts.depositoGarantia,
        mantenimiento: schema.contracts.mantenimiento,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        estado: schema.contracts.estado,
        muebleriaItems: schema.contracts.muebleriaItems,
        mascotasItems: schema.contracts.mascotasItems,
        departamentoNombre: schema.departments.nombre,
        departamentoCodigo: schema.departments.codigo,
        personaPago: schema.departments.personaPago,
      })
      .from(schema.contracts)
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId)
      )
      .where(eq(schema.contracts.clienteId, cliente.id))
      .orderBy(desc(schema.contracts.fechaFin))
      .limit(1);

    if (!contrato || !["FIRMADO", "NOTARIADO"].includes(contrato.estado)) {
      return NextResponse.json(
        { error: "La ficha del cliente estará disponible cuando el contrato esté firmado o notariado" },
        { status: 403 }
      );
    }

    const pagos = contrato
      ? await db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.contractId, contrato.id))
      : [];

    return NextResponse.json({
      cliente: {
        id: cliente.id,
        nombres: cliente.nombres,
        apellidos: cliente.apellidos,
        documentoIdentidad: cliente.documentoIdentidad,
        ruc: cliente.ruc,
        tipoPersona: cliente.tipoPersona,
        email: cliente.email,
        telefono: cliente.telefono,
        domicilio: cliente.domicilio,
        codigoDepartamento: cliente.codigoDepartamento,
      },
      contrato: contrato
        ? {
            ...contrato,
            fechaInicio: toDateStr(contrato.fechaInicio),
            fechaFin: toDateStr(contrato.fechaFin),
          }
        : null,
      pagos: pagos.map((p) => ({
        id: p.id,
        contractId: p.contractId,
        periodo: toDateStr(p.periodo),
        monto: p.monto,
        mantenimiento: p.mantenimiento,
        penalidad: p.penalidad,
        estado: p.estado,
        fechaPago: p.fechaPago ? toDateStr(p.fechaPago) : null,
        voucherNombre: p.voucherNombre,
        voucherUrl: p.voucherUrl,
        vouchers: p.vouchers,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
