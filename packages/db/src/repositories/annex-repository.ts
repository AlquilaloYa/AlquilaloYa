import { and, eq } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  Annex,
  AnnexRepository,
  AnnexVersion,
  CreateAnnexInput,
  UUID,
} from "@contract/domain";

type AnnexRow = typeof schema.annexes.$inferSelect;
type AnnexVersionRow = typeof schema.annexVersions.$inferSelect;

function annexToDomain(a: AnnexRow): Annex {
  return {
    id: a.id,
    departamentoId: a.departamentoId,
    nombre: a.nombre,
    activo: a.activo,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function versionToDomain(v: AnnexVersionRow): AnnexVersion {
  return {
    id: v.id,
    annexId: v.annexId,
    version: v.version,
    contenido: v.contenido,
    publicada: v.publicada,
    publicadoEn: v.publicadoEn ? v.publicadoEn.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}

/** Repositorio Drizzle de anexos y versiones. */
export class DrizzleAnnexRepository implements AnnexRepository {
  async createAnnex(input: CreateAnnexInput): Promise<Annex> {
    const [row] = await db
      .insert(schema.annexes)
      .values({
        departamentoId: input.departamentoId,
        nombre: input.nombre,
        activo: input.activo,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el anexo");
    return annexToDomain(row);
  }

  async findActiveByDepartment(departamentoId: UUID): Promise<Annex[]> {
    const rows = await db
      .select()
      .from(schema.annexes)
      .where(
        and(
          eq(schema.annexes.departamentoId, departamentoId),
          eq(schema.annexes.activo, true)
        )
      );
    return rows.map(annexToDomain);
  }

  async findVersions(annexId: UUID): Promise<AnnexVersion[]> {
    const rows = await db
      .select()
      .from(schema.annexVersions)
      .where(eq(schema.annexVersions.annexId, annexId))
      .orderBy(schema.annexVersions.version);
    return rows.map(versionToDomain);
  }

  async findVersionById(versionId: UUID): Promise<AnnexVersion | null> {
    const [row] = await db
      .select()
      .from(schema.annexVersions)
      .where(eq(schema.annexVersions.id, versionId));
    return row ? versionToDomain(row) : null;
  }

  async createVersion(
    annexId: UUID,
    version: number,
    contenido: string
  ): Promise<AnnexVersion> {
    const [row] = await db
      .insert(schema.annexVersions)
      .values({ annexId, version, contenido })
      .returning();
    if (!row) throw new Error("No se pudo crear la versión");
    return versionToDomain(row);
  }

  async publishVersion(versionId: UUID): Promise<AnnexVersion> {
    const [row] = await db
      .update(schema.annexVersions)
      .set({ publicada: true, publicadoEn: new Date() })
      .where(eq(schema.annexVersions.id, versionId))
      .returning();
    if (!row) throw new Error("Versión no encontrada");
    return versionToDomain(row);
  }
}