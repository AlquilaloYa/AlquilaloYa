import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit-log";
import { generateServiciosExtrasPdf } from "@/lib/pdf/generate-servicios-extras-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

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
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contractId");

    const { eq, desc } = await import("drizzle-orm");
    const base = db.select().from(schema.serviciosExtras);
    const rows = contractId
      ? await base.where(eq(schema.serviciosExtras.contractId, contractId)).orderBy(desc(schema.serviciosExtras.createdAt))
      : await base.orderBy(desc(schema.serviciosExtras.createdAt));

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        fechaOpcion: toDateStr(r.fechaOpcion),
        fechaPago: r.fechaPago ? toDateStr(r.fechaPago) : null,
      }))
    );
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
    const denied = requirePermission(auth.user, Permission.CONTRACT_UPDATE);
    if (denied) return denied;

    const body = await req.json();
    const {
      contractId,
      clienteId,
      incluyeInternet = false,
      incluyeCargaElectrica = false,
      fechaOpcion,
      fechaPago,
    } = body;

    if (!contractId) {
      return NextResponse.json({ error: "contractId requerido" }, { status: 400 });
    }
    if (!incluyeInternet && !incluyeCargaElectrica) {
      return NextResponse.json({ error: "Debe seleccionar al menos un servicio" }, { status: 400 });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");

    const [contract] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.id, contractId))
      .limit(1);
    if (!contract) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    const [cliente] = clienteId
      ? await db.select().from(schema.clients).where(eq(schema.clients.id, clienteId)).limit(1)
      : await db.select().from(schema.clients).where(eq(schema.clients.id, contract.clienteId)).limit(1);

    const montoInternet = "39.00";
    const montoCargaElectrica = "60.00";
    const montoTotal = String((Number(incluyeInternet ? montoInternet : 0) + Number(incluyeCargaElectrica ? montoCargaElectrica : 0)));

    const tipoServicio = incluyeInternet && incluyeCargaElectrica
      ? "AMBOS"
      : incluyeInternet
        ? "INTERNET"
        : "CARGA_ELECTRICA";

    const depto = await db.select().from(schema.departments).where(eq(schema.departments.id, contract.departamentoId)).limit(1);
    const deptoNumero = depto[0]?.codigo || depto[0]?.nombre || "";

    const [row] = await db
      .insert(schema.serviciosExtras)
      .values({
        contractId,
        clienteId: cliente?.id || contract.clienteId,
        codigoContrato: contract.codigoContrato,
        tipoServicio,
        incluyeInternet,
        incluyeCargaElectrica,
        montoInternet,
        montoCargaElectrica,
        montoTotal,
        fechaOpcion: fechaOpcion || new Date().toISOString().slice(0, 10),
        fechaPago: fechaPago || contract.fechaInicio || null,
        departamentoNumero: deptoNumero,
        clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos || ""}`.trim() : "",
        clienteDocumento: cliente?.documentoIdentidad || cliente?.ruc || "",
        estado: "PENDIENTE",
      })
      .returning();

    if (!row) {
      return NextResponse.json(
        { error: "No se pudo registrar el servicio extra" },
        { status: 500 },
      );
    }

    await recordAdminAction(dbModule, auth.user, {
      action: "SERVICIOS_EXTRAS_CREATED",
      module: "CONTRACTS",
      entityType: "SERVICIOS_EXTRAS",
      entityId: row.id,
      current: { contractId, tipoServicio },
    });

    try {
      const pdf = await generateServiciosExtrasPdf(row, contract, cliente, depto[0]);
      const [updated] = await db
        .update(schema.serviciosExtras)
        .set({
          filename: pdf.filename,
          storageKey: pdf.storageKey,
          sha256: pdf.sha256,
        })
        .where(eq(schema.serviciosExtras.id, row.id))
        .returning();
      return NextResponse.json(updated ?? row);
    } catch (e) {
      console.error("No se pudo generar el PDF de servicios extras", e);
    }

    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

