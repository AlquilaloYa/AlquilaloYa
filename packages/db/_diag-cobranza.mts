import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./src/index";

async function main() {
  const t0 = Date.now();
  const [contratos, pagos, departamentos, contratosOcupacion] = await Promise.all([
    db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        clienteNombre: schema.clients.nombres,
        clienteApellido: schema.clients.apellidos,
        departamentoCodigo: schema.departments.codigo,
        personaPago: schema.departments.personaPago,
        estado: schema.contracts.estado,
        montoCanonMensual: schema.contracts.montoCanonMensual,
        mantenimiento: schema.contracts.mantenimiento,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId)),
    db
      .select({
        contractId: schema.payments.contractId,
        periodo: schema.payments.periodo,
        monto: schema.payments.monto,
        mantenimiento: schema.payments.mantenimiento,
        estado: schema.payments.estado,
        fechaPago: schema.payments.fechaPago,
      })
      .from(schema.payments),
    db
      .select({
        id: schema.departments.id,
        codigo: schema.departments.codigo,
        nombre: schema.departments.nombre,
        numero: schema.departments.numero,
        personaPago: schema.departments.personaPago,
        estadoManual: schema.departments.estadoManual,
      })
      .from(schema.departments),
    db
      .select({
        id: schema.contracts.id,
        codigoContrato: schema.contracts.codigoContrato,
        departamentoId: schema.contracts.departamentoId,
        personaPago: schema.departments.personaPago,
        fechaInicio: schema.contracts.fechaInicio,
        fechaFin: schema.contracts.fechaFin,
        estado: schema.contracts.estado,
        clienteNombre: schema.clients.nombres,
        clienteApellido: schema.clients.apellidos,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.contracts.departamentoId))
      .where(inArray(schema.contracts.estado, ["FIRMADO", "ACTIVO", "VIGENTE", "NOTARIADO"])),
  ]);
  const t1 = Date.now();

  console.log(JSON.stringify({
    ms: t1 - t0,
    contratos: contratos.length,
    pagos: pagos.length,
    departamentos: departamentos.length,
    contratosOcupacion: contratosOcupacion.length,
    contratosEjemplo: contratos.slice(0, 2),
    pagoEjemplo: pagos.slice(0, 2),
  }, null, 2));

  await db.$client.end?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});