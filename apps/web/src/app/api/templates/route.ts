import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";
import { buildContractServices } from "@/lib/contract-app";
import type { CreateTemplateInput, CreateTemplateVersionInput } from "@contract/domain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.TEMPLATE_READ);
    if (denied) return denied;

    if (new URL(req.url).searchParams.get("selector") === "1") {
      const { db, schema } = dbModule as {
        db: typeof import("@contract/db").db;
        schema: typeof import("@contract/db").schema;
      };
      const { and, desc, eq, inArray } = await import("drizzle-orm");
      const templates = await db
        .select({
          id: schema.templates.id,
          clave: schema.templates.clave,
          nombre: schema.templates.nombre,
        })
        .from(schema.templates)
        .where(eq(schema.templates.activo, true));

      if (templates.length === 0) {
        return NextResponse.json({ templates: [], versions: {} });
      }

      const publishedVersions = await db
        .select({
          id: schema.templateVersions.id,
          templateId: schema.templateVersions.templateId,
          version: schema.templateVersions.version,
          publicada: schema.templateVersions.publicada,
        })
        .from(schema.templateVersions)
        .where(
          and(
            inArray(
              schema.templateVersions.templateId,
              templates.map((template) => template.id)
            ),
            eq(schema.templateVersions.publicada, true)
          )
        )
        .orderBy(desc(schema.templateVersions.version));

      const versions: Record<
        string,
        { id: string; version: number; publicada: boolean }
      > = {};
      for (const version of publishedVersions) {
        if (!versions[version.templateId]) {
          versions[version.templateId] = {
            id: version.id,
            version: version.version,
            publicada: version.publicada,
          };
        }
      }
      return NextResponse.json({ templates, versions });
    }

    const { templateService } = await buildContractServices();
    const templates = await templateService.listActive();
    return NextResponse.json(templates);
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
    const denied = requirePermission(auth.user, Permission.TEMPLATE_MANAGE);
    if (denied) return denied;

    const body = (await request.json()) as
      | CreateTemplateInput
      | { createVersion: CreateTemplateVersionInput };
    const { templateService } = await buildContractServices();

    if ("createVersion" in body && body.createVersion) {
      if (!body.createVersion.contenido?.trim() && !body.createVersion.pdfStorageKey) {
        return NextResponse.json(
          { error: "La versión requiere contenido o un archivo PDF" },
          { status: 400 }
        );
      }
      const version = await templateService.createVersion({
        templateId: body.createVersion.templateId,
        ...(body.createVersion.contenido
          ? { contenido: body.createVersion.contenido }
          : {}),
        ...(body.createVersion.pdfStorageKey
          ? {
              pdfStorageKey: body.createVersion.pdfStorageKey,
              pdfFilename: body.createVersion.pdfFilename,
            }
          : {}),
      });
      return NextResponse.json(version, { status: 201 });
    }

    const created = await templateService.createTemplate(
      body as CreateTemplateInput
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}