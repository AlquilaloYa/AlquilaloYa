import { and, eq } from "drizzle-orm";
import { db, schema } from "../index";
import type {
  ContractTemplate,
  CreateTemplateInput,
  TemplateRepository,
  TemplateVersion,
  TemplateType,
  UUID,
} from "@contract/domain";

type TemplateRow = typeof schema.templates.$inferSelect;
type TemplateVersionRow = typeof schema.templateVersions.$inferSelect;

function templateToDomain(t: TemplateRow): ContractTemplate {
  return {
    id: t.id,
    clave: t.clave as TemplateType,
    nombre: t.nombre,
    activo: t.activo,
  };
}

function versionToDomain(v: TemplateVersionRow): TemplateVersion {
  return {
    id: v.id,
    templateId: v.templateId,
    version: v.version,
    contenido: v.contenido,
    pdfStorageKey: v.pdfStorageKey ?? null,
    pdfFilename: v.pdfFilename ?? null,
    publicada: v.publicada,
    publicadoEn: v.publicadoEn ? v.publicadoEn.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}

/** Repositorio Drizzle de plantillas y versiones. */
export class DrizzleTemplateRepository implements TemplateRepository {
  async listActive(): Promise<ContractTemplate[]> {
    const rows = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.activo, true));
    return rows.map(templateToDomain);
  }

  async createTemplate(input: CreateTemplateInput): Promise<ContractTemplate> {
    const [row] = await db
      .insert(schema.templates)
      .values({ clave: input.clave, nombre: input.nombre })
      .returning();
    if (!row) throw new Error("No se pudo crear la plantilla");
    return templateToDomain(row);
  }

  async findVersions(templateId: UUID): Promise<TemplateVersion[]> {
    const rows = await db
      .select()
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.templateId, templateId))
      .orderBy(schema.templateVersions.version);
    return rows.map(versionToDomain);
  }

  async findVersionById(versionId: UUID): Promise<TemplateVersion | null> {
    const [row] = await db
      .select()
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, versionId));
    return row ? versionToDomain(row) : null;
  }

  async findLatestPublished(templateId: UUID): Promise<TemplateVersion | null> {
    const [row] = await db
      .select()
      .from(schema.templateVersions)
      .where(
        and(
          eq(schema.templateVersions.templateId, templateId),
          eq(schema.templateVersions.publicada, true)
        )
      )
      .orderBy(schema.templateVersions.version);
    return row ? versionToDomain(row) : null;
  }

  async createVersion(
    templateId: UUID,
    version: number,
    contenido: string | null,
    pdfStorageKey?: string | null,
    pdfFilename?: string | null
  ): Promise<TemplateVersion> {
    const [row] = await db
      .insert(schema.templateVersions)
      .values({
        templateId,
        version,
        contenido,
        pdfStorageKey: pdfStorageKey ?? null,
        pdfFilename: pdfFilename ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la versión");
    return versionToDomain(row);
  }

  async publishVersion(versionId: UUID): Promise<TemplateVersion> {
    const [row] = await db
      .update(schema.templateVersions)
      .set({ publicada: true, publicadoEn: new Date() })
      .where(eq(schema.templateVersions.id, versionId))
      .returning();
    if (!row) throw new Error("Versión no encontrada");
    return versionToDomain(row);
  }
}