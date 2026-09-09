import { eq } from "drizzle-orm";
import { db } from "@contract/db";
import { contractSnapshots } from "@contract/db/schema";
import type { ContractSnapshot } from "@contract/domain/snapshot";

/** Lee snapshots desde la DB y los entrega como dominio inmutables. */
export class DrizzleSnapshotReader {
  async findById(id: string): Promise<ContractSnapshot | null> {
    const [row] = await db
      .select()
      .from(contractSnapshots)
      .where(eq(contractSnapshots.id, id));
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      codigoContrato: row.codigoContrato,
      plantillaVersionId: row.plantillaVersionId,
      datosCliente: row.datosCliente as Record<string, unknown>,
      datosDepartamento: row.datosDepartamento as Record<string, unknown>,
      datosContrato: row.datosContrato as Record<string, unknown>,
      clausulas: Array.isArray(row.clausulas)
        ? (row.clausulas as Array<{ versionId: string; contenido: string }>)
        : [],
      anexos: Array.isArray(row.anexos)
        ? (row.anexos as Array<{ versionId: string; contenido: string }>)
        : [],
      inmutable: row.inmutable,
      emitidoEn: row.emitidoEn ? row.emitidoEn.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}