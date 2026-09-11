import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import { sincronizarTareasContrato } from "@/lib/tareas-contrato";
import type { CreateContractInput } from "@contract/domain";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        clienteId: schema.contracts.clienteId,
        departamentoId: schema.contracts.departamentoId,
        plantillaVersionId: schema.contracts.plantillaVersionId,
        montoCanonMensual: schema.contracts.montoCanonMensual,
        depositoGarantia: schema.contracts.depositoGarantia,
        mantenimiento: schema.contracts.mantenimiento,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        estado: schema.contracts.estado,
        snapshotId: schema.contracts.snapshotId,
        renovadoDe: schema.contracts.renovadoDe,
        separacion: schema.contracts.separacion,
        muebleriaItems: schema.contracts.muebleriaItems,
        mascotasItems: schema.contracts.mascotasItems,
        motivoResolucion: schema.contracts.motivoResolucion,
        resueltoEn: schema.contracts.resueltoEn,
        creadoEn: schema.contracts.creadoEn,
        actualizadoEn: schema.contracts.actualizadoEn,
        clienteNombre: schema.clients.nombres,
        clienteApellido: schema.clients.apellidos,
        departamentoNombre: schema.departments.nombre,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(
        schema.departments,
        eq(schema.departments.id, schema.contracts.departamentoId)
      )
      .orderBy(schema.contracts.creadoEn);

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        id: r.id,
        createdAt: r.creadoEn.toISOString(),
        updatedAt: r.actualizadoEn.toISOString(),
        clienteNombre: r.clienteNombre ?? "",
        apellidoCliente: r.clienteApellido ?? "",
        departamentoNombre: r.departamentoNombre ?? "",
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.CONTRACT_CREATE);
    if (denied) return denied;

    const body = (await request.json()) as CreateContractInput & {
      cliente?: {
        nombres: string;
        apellidos?: string | null;
        documentoIdentidad: string;
        ruc?: string | null;
        tipoPersona: string;
        email?: string | null;
        telefono?: string | null;
        codigoDepartamento?: string | null;
        domicilio?: string | null;
      };
      separacionDetalle?: {
        tipo: "500" | "TOTAL" | "FLUCTUANTE";
        monto: string;
        garantiaExtendida?: boolean;
        fecha?: string | null;
        baucherSeparacion?: string | null;
      } | null;
      copiaDni?: Array<{
        nombre: string;
        tipo: string;
        dataUrl: string;
      }>;
    };
    if (!UUID_PATTERN.test(body.departamentoId)) {
      return NextResponse.json(
        { error: "El departamento seleccionado ya no es válido. Asígnalo nuevamente desde Departamentos." },
        { status: 400 }
      );
    }
    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    let clienteId = body.clienteId;
    if (!UUID_PATTERN.test(clienteId)) {
      if (!body.cliente?.documentoIdentidad) {
        return NextResponse.json(
          { error: "El cliente seleccionado no es válido. Selecciona nuevamente el depositante." },
          { status: 400 }
        );
      }
      const { eq } = await import("drizzle-orm");
      const [existing] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(eq(schema.clients.documentoIdentidad, body.cliente.documentoIdentidad))
        .limit(1);
      if (existing) {
        clienteId = existing.id;
        if (body.cliente.domicilio?.trim()) {
          await db
            .update(schema.clients)
            .set({ domicilio: body.cliente.domicilio.trim(), updatedAt: new Date() })
            .where(eq(schema.clients.id, existing.id));
        }
      } else {
        const [createdClient] = await db
          .insert(schema.clients)
          .values({
            nombres: body.cliente.nombres,
            apellidos: body.cliente.apellidos ?? null,
            documentoIdentidad: body.cliente.documentoIdentidad,
            ruc: body.cliente.ruc ?? null,
            tipoPersona: body.cliente.tipoPersona,
            email: body.cliente.email ?? null,
            telefono: body.cliente.telefono ?? null,
            codigoDepartamento: body.cliente.codigoDepartamento ?? null,
            domicilio: body.cliente.domicilio ?? null,
            activo: true,
          })
          .returning({ id: schema.clients.id });
        if (!createdClient) {
          return NextResponse.json(
            { error: "No se pudo crear el cliente" },
            { status: 500 }
          );
        }
        clienteId = createdClient.id;
      }
    }
    const { cliente: _cliente, ...contractInput } = body;
    void _cliente;
    const { codigoContrato: codigoBase } = contractInput;
    const existingCodes = await db
      .select({ codigoContrato: schema.contracts.codigoContrato })
      .from(schema.contracts);
    const usedCodes = new Set(existingCodes.map((row) => row.codigoContrato));
    let codigoContrato = codigoBase?.trim() || `CTR-${Date.now().toString().slice(-8)}`;
    const codigoInicial = codigoContrato;
    let consecutivo = 2;
    while (usedCodes.has(codigoContrato)) {
      const sufijo = `-C${consecutivo}`;
      codigoContrato = `${codigoInicial.slice(0, 50 - sufijo.length)}${sufijo}`;
      consecutivo += 1;
    }
    const { contractService } = await buildContractServices({
      userId: auth.user.id,
      name: auth.user.name,
    });
    const created = await contractService.createContract({
      ...contractInput,
      codigoContrato,
      clienteId,
      separacion: body.separacion ?? true,
      separacionDetalle: body.separacionDetalle
        ? {
            tipo: body.separacionDetalle.tipo,
            monto: body.separacionDetalle.monto,
            garantiaExtendida: Boolean(body.separacionDetalle.garantiaExtendida),
            fecha: body.separacionDetalle.fecha ?? null,
            baucherSeparacion:
              typeof body.separacionDetalle.baucherSeparacion === "string" &&
              body.separacionDetalle.baucherSeparacion.startsWith("data:")
                ? body.separacionDetalle.baucherSeparacion
                : null,
          }
        : null,
      copiaDni: Array.isArray(body.copiaDni)
        ? body.copiaDni.filter((archivo) =>
            archivo && typeof archivo.dataUrl === "string" && archivo.dataUrl.startsWith("data:"))
        : [],
      muebleriaItems: body.muebleriaItems ?? [],
      mascotasItems: body.mascotasItems ?? [],
    });
    try {
      await sincronizarTareasContrato(created.id);
    } catch {
      /* las tareas automaticas no deben bloquear la creacion del contrato */
    }
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}