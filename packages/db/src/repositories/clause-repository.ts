import { eq } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  Clause,
  ClauseRepository,
  ClauseVersion,
  ClauseVersionState,
  CreateClauseInput,
  UUID,
} from "@contract/domain";

type ClauseRow = typeof schema.clauses.$inferSelect;
type ClauseVersionRow = typeof schema.clauseVersions.$inferSelect;

function clauseToDomain(c: ClauseRow): Clause {
  return {
    id: c.id,
    clave: c.clave,
    nombre: c.nombre,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function versionToDomain(v: ClauseVersionRow): ClauseVersion {
  return {
    id: v.id,
    clauseId: v.clauseId,
    version: v.version,
    contenido: v.contenido,
    publicada: v.publicada as ClauseVersionState,
    createdAt: v.createdAt.toISOString(),
  };
}

/** Repositorio Drizzle de cláusulas y versiones. */
export class DrizzleClauseRepository implements ClauseRepository {
  async createClause(input: CreateClauseInput): Promise<Clause> {
    const [row] = await db
      .insert(schema.clauses)
      .values({ clave: input.clave, nombre: input.nombre })
      .returning();
    if (!row) throw new Error("No se pudo crear la cláusula");
    return clauseToDomain(row);
  }

  async findVersions(clauseId: UUID): Promise<ClauseVersion[]> {
    const rows = await db
      .select()
      .from(schema.clauseVersions)
      .where(eq(schema.clauseVersions.clauseId, clauseId))
      .orderBy(schema.clauseVersions.version);
    return rows.map(versionToDomain);
  }

  async findVersionById(versionId: UUID): Promise<ClauseVersion | null> {
    const [row] = await db
      .select()
      .from(schema.clauseVersions)
      .where(eq(schema.clauseVersions.id, versionId));
    return row ? versionToDomain(row) : null;
  }

  async createVersion(
    clauseId: UUID,
    version: number,
    contenido: string
  ): Promise<ClauseVersion> {
    const [row] = await db
      .insert(schema.clauseVersions)
      .values({ clauseId, version, contenido })
      .returning();
    if (!row) throw new Error("No se pudo crear la versión");
    return versionToDomain(row);
  }

  async publishVersion(versionId: UUID): Promise<ClauseVersion> {
    const [row] = await db
      .update(schema.clauseVersions)
      .set({ publicada: "PUBLICADA" })
      .where(eq(schema.clauseVersions.id, versionId))
      .returning();
    if (!row) throw new Error("Versión no encontrada");
    return versionToDomain(row);
  }
}