import { generateServiciosExtrasPdf } from "@/lib/pdf/generate-servicios-extras-pdf";
import { deleteObject } from "@/lib/storage";

type Db = (typeof import("@contract/db"))["db"];
type Schema = (typeof import("@contract/db"))["schema"];
export type ServicioExtraRow = (typeof import("@contract/db"))["schema"]["serviciosExtras"]["$inferSelect"];

export interface RegeneracionServicioExtra {
  row: ServicioExtraRow;
  bytes: Uint8Array;
  filename: string;
}

/**
 * Re-renderiza el PDF de un servicio extra con los datos vigentes del
 * contrato/cliente/departamento, lo reemplaza en el bucket privado y actualiza
 * filename/storageKey/sha256 en la fila. Si el nuevo objeto tiene otra clave,
 * elimina la copia anterior para no dejar huérfanos.
 */
export async function regenerarPdfServicioExtra(
  db: Db,
  schema: Schema,
  row: ServicioExtraRow,
): Promise<RegeneracionServicioExtra> {
  const { eq } = await import("drizzle-orm");

  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(eq(schema.contracts.id, row.contractId))
    .limit(1);
  const [cliente] = row.clienteId
    ? await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.id, row.clienteId))
        .limit(1)
    : [];
  const [depto] = contract
    ? await db
        .select()
        .from(schema.departments)
        .where(eq(schema.departments.id, contract.departamentoId))
        .limit(1)
    : [];

  const pdf = await generateServiciosExtrasPdf(row, contract, cliente, depto);

  const [updated] = await db
    .update(schema.serviciosExtras)
    .set({
      filename: pdf.filename,
      storageKey: pdf.storageKey,
      sha256: pdf.sha256,
      updatedAt: new Date(),
    })
    .where(eq(schema.serviciosExtras.id, row.id))
    .returning();

  const oldKey = row.storageKey;
  if (oldKey && pdf.storageKey && oldKey !== pdf.storageKey) {
    try {
      await deleteObject(oldKey);
    } catch (error) {
      console.error("No se pudo eliminar la copia anterior del PDF", error);
    }
  }

  return { row: updated ?? row, bytes: pdf.bytes, filename: pdf.filename };
}
