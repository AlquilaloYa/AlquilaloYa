import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { ESTADOS_CONTRATO_OCUPANTES } from "@/lib/estado-contrato";
import {
  clasificarSinOcupante,
  normalizarEstadoManual,
} from "@/lib/estado-departamento";

export const dynamic = "force-dynamic";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;

    for (const permission of [
      Permission.CONTRACT_READ,
      Permission.DEPARTMENT_READ,
    ]) {
      const denied = requirePermission(auth.user, permission);
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (month && !MONTH_PATTERN.test(month)) {
      return NextResponse.json({ error: "El mes debe tener formato YYYY-MM" }, { status: 400 });
    }

    const { db, schema } = dbModule;
    const { and, eq, gte, inArray, isNull, lte } = await import("drizzle-orm");
    const today = new Date().toISOString().slice(0, 10);
    const paymentConditions = [
      isNull(schema.payments.eliminadoEn),
      isNull(schema.contracts.eliminadoEn),
    ];
    if (month) {
      const lastDay = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
      paymentConditions.push(
        gte(schema.payments.periodo, `${month}-01`),
        lte(schema.payments.periodo, lastDay),
      );
    }

    const [paymentRows, departments, contracts] = await Promise.all([
      db
        .select({
          periodo: schema.payments.periodo,
          fechaPago: schema.payments.fechaPago,
          monto: schema.payments.monto,
          mantenimiento: schema.payments.mantenimiento,
          penalidad: schema.payments.penalidad,
          montoPagado: schema.payments.montoPagado,
          estado: schema.payments.estado,
          codigoContrato: schema.contracts.codigoContrato,
          inquilinoNombres: schema.clients.nombres,
          inquilinoApellidos: schema.clients.apellidos,
          inmuebleCodigo: schema.departments.codigo,
          inmuebleNombre: schema.departments.nombre,
          inmuebleNumero: schema.departments.numero,
          propietario: schema.departments.personaPago,
        })
        .from(schema.payments)
        .innerJoin(
          schema.contracts,
          eq(schema.contracts.id, schema.payments.contractId),
        )
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId),
        )
        .leftJoin(
          schema.departments,
          eq(schema.departments.id, schema.contracts.departamentoId),
        )
        .where(and(...paymentConditions)),
      db
        .select({
          id: schema.departments.id,
          codigo: schema.departments.codigo,
          nombre: schema.departments.nombre,
          numero: schema.departments.numero,
          piso: schema.departments.piso,
          precio: schema.departments.precio,
          personaPago: schema.departments.personaPago,
          activo: schema.departments.activo,
          estadoManual: schema.departments.estadoManual,
        })
        .from(schema.departments)
        .orderBy(schema.departments.nombre, schema.departments.numero),
      db
        .select({
          departamentoId: schema.contracts.departamentoId,
          fechaInicio: schema.contracts.fechaInicio,
          fechaFin: schema.contracts.fechaFin,
          estado: schema.contracts.estado,
          clienteNombres: schema.clients.nombres,
          clienteApellidos: schema.clients.apellidos,
        })
        .from(schema.contracts)
        .leftJoin(
          schema.clients,
          eq(schema.clients.id, schema.contracts.clienteId),
        )
        .where(
          and(
            inArray(schema.contracts.estado, ESTADOS_CONTRATO_OCUPANTES),
            isNull(schema.contracts.eliminadoEn),
          ),
        ),
    ]);

    const contractsByDepartment = new Map<
      string,
      (typeof contracts)[number][]
    >();
    for (const contract of contracts) {
      const group = contractsByDepartment.get(contract.departamentoId) ?? [];
      group.push(contract);
      contractsByDepartment.set(contract.departamentoId, group);
    }

    const propertyRows = departments.map((department) => {
      const departmentContracts =
        contractsByDepartment.get(department.id) ?? [];
      const currentContracts = departmentContracts
        .filter(
          (contract) =>
            contract.fechaInicio <= today && contract.fechaFin >= today,
        )
        .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
      const latestEnd = departmentContracts.reduce<string | null>(
        (latest, contract) =>
          latest === null || contract.fechaFin > latest
            ? contract.fechaFin
            : latest,
        null,
      );
      const currentContract = currentContracts[0];
      const { enMantenimiento, bloqueado } = currentContract
        ? { enMantenimiento: false, bloqueado: false }
        : clasificarSinOcupante({
            estadoManual: normalizarEstadoManual(department.estadoManual),
            ultimoFin: latestEnd,
            hoy: today,
          });

      return {
        codigo: department.codigo,
        inmueble: `${department.nombre} ${department.numero}`.trim(),
        piso: department.piso,
        propietario: department.personaPago,
        precioMensual: Number(department.precio),
        estado: currentContract
          ? "OCUPADO"
          : bloqueado
            ? "BLOQUEADO"
            : enMantenimiento
              ? "MANTENIMIENTO"
              : "DISPONIBLE",
        inquilino: currentContract
          ? [currentContract.clienteNombres, currentContract.clienteApellidos]
              .filter(Boolean)
              .join(" ")
          : "",
        activo: department.activo,
      };
    });

    const paymentData = paymentRows.map((payment) => {
      const alquiler = Number(payment.monto);
      const mantenimiento = Number(payment.mantenimiento);
      const penalidad = Number(payment.penalidad);
      const pagado = Number(payment.montoPagado);
      const total = alquiler + mantenimiento + penalidad;
      return {
        periodo: String(payment.periodo).slice(0, 10),
        propietario: payment.propietario ?? "",
        inquilino: [payment.inquilinoNombres, payment.inquilinoApellidos]
          .filter(Boolean)
          .join(" "),
        inmueble: [payment.inmuebleCodigo, payment.inmuebleNombre, payment.inmuebleNumero]
          .filter(Boolean)
          .join(" "),
        contrato: payment.codigoContrato,
        alquiler,
        mantenimiento,
        penalidad,
        montoTotal: total,
        montoPagado: pagado,
        saldo: Math.max(0, total - pagado),
        fechaPago: payment.fechaPago
          ? String(payment.fechaPago).slice(0, 10)
          : "",
        estado: payment.estado,
      };
    });

    return NextResponse.json(
      { pagos: paymentData, inmuebles: propertyRows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al preparar la exportación" },
      { status: 500 },
    );
  }
}
