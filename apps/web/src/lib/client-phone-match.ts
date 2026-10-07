import { and, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

type Db = typeof import("@contract/db").db;
type Schema = typeof import("@contract/db").schema;

export interface MatchedClient {
  id: string;
  nombre: string;
  apellidos: string | null;
  codigoDepartamento: string | null;
  departamentoNombre: string | null;
}

function tieneContratoNotariado(db: Db, schema: Schema) {
  return exists(
    db.select({ id: schema.contracts.id })
      .from(schema.contracts)
      .innerJoin(schema.documents, eq(schema.documents.contractId, schema.contracts.id))
      .where(and(
        eq(schema.contracts.clienteId, schema.clients.id),
        eq(schema.contracts.estado, "NOTARIADO"),
        eq(schema.documents.tipo, "CONTRATO_NOTARIADO"),
        isNotNull(schema.documents.storageKey)
      ))
  );
}

export async function buscarClienteUnicoPorTelefono(
  db: Db,
  schema: Schema,
  telefono: string
): Promise<MatchedClient | null> {
  const digitosTelefono = telefono.replace(/\D/g, "");
  if (!digitosTelefono) return null;

  const digitosCliente = sql`regexp_replace(coalesce(${schema.clients.telefono}, ''), '[^0-9]', '', 'g')`;
  const codigoPais = sql`regexp_replace(coalesce(${schema.clients.codigoPais}, ''), '[^0-9]', '', 'g')`;
  const telefonoLocal = sql`CASE
    WHEN ${codigoPais} <> '' AND left(${digitosCliente}, length(${codigoPais})) = ${codigoPais}
    THEN substring(${digitosCliente} from length(${codigoPais}) + 1)
    ELSE ''
  END`;

  const matches = await db
    .select({
      id: schema.clients.id,
      nombre: schema.clients.nombres,
      apellidos: schema.clients.apellidos,
      codigoDepartamento: schema.clients.codigoDepartamento,
      departamentoNombre: schema.departments.nombre,
    })
    .from(schema.clients)
    .leftJoin(
      schema.departments,
      eq(schema.departments.codigo, schema.clients.codigoDepartamento)
    )
    .where(
      and(
        eq(schema.clients.activo, true),
        isNull(schema.clients.eliminadoEn),
        tieneContratoNotariado(db, schema),
        or(
          eq(digitosCliente, digitosTelefono),
          eq(sql`concat(${codigoPais}, ${digitosCliente})`, digitosTelefono),
          eq(telefonoLocal, digitosTelefono)
        )
      )
    )
    .limit(2);

  return matches.length === 1 ? matches[0] ?? null : null;
}

export async function buscarClienteNotariadoPorId(
  db: Db,
  schema: Schema,
  clientId: string
): Promise<MatchedClient | null> {
  const [client] = await db
    .select({
      id: schema.clients.id,
      nombre: schema.clients.nombres,
      apellidos: schema.clients.apellidos,
      codigoDepartamento: schema.clients.codigoDepartamento,
      departamentoNombre: schema.departments.nombre,
    })
    .from(schema.clients)
    .leftJoin(
      schema.departments,
      eq(schema.departments.codigo, schema.clients.codigoDepartamento)
    )
    .where(and(
      eq(schema.clients.id, clientId),
      eq(schema.clients.activo, true),
      isNull(schema.clients.eliminadoEn),
      tieneContratoNotariado(db, schema)
    ))
    .limit(1);

  return client ?? null;
}
