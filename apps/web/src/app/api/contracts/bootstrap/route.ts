import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import {
  applySessionCookies,
  isNativeMobileRequest,
} from "@/lib/supabase-auth";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function fechasLimite(fechaSeparacion: Date) {
  const base = fechaSeparacion.getTime();
  return {
    fechaLimite48h: new Date(base + 48 * 3_600_000).toISOString(),
    fechaLimite120h: new Date(base + 120 * 3_600_000).toISOString(),
    fechaLimite168h: new Date(base + 168 * 3_600_000).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user, Permission.CONTRACT_READ);
    if (denied) return denied;

    const { db, schema } = dbModule;
    const canReadDepartments =
      !requirePermission(auth.user, Permission.DEPARTMENT_READ);
    const canReadContacts = !requirePermission(auth.user, Permission.CLIENT_READ);
    const canReadTemplates = !requirePermission(auth.user, Permission.TEMPLATE_READ);

    const withSessionCookies = (response: NextResponse) =>
      auth.sessionTokens.refreshed
        ? applySessionCookies(
            response,
            auth.sessionTokens.refreshed,
            isNativeMobileRequest(request)
          )
        : response;

    if (mode === "applicants") {
      if (!canReadDepartments) {
        return requirePermission(auth.user, Permission.DEPARTMENT_READ)!;
      }
      if (!canReadContacts) {
        return requirePermission(auth.user, Permission.CLIENT_READ)!;
      }

      const applicants = await db
        .select({
          contactoId: schema.contacts.id,
          nombre: schema.contacts.nombre,
          apellido: schema.contacts.apellido,
          tipoPersona: schema.contacts.tipoPersona,
          dni: schema.contacts.dni,
          ruc: schema.contacts.ruc,
          email: schema.contacts.email,
          telefono: schema.contacts.telefono,
          codigoPais: schema.contacts.codigoPais,
          domicilio: schema.contacts.domicilio,
          nacionalidad: schema.contacts.nacionalidad,
          contactoEmergencia: schema.contacts.contactoEmergencia,
          mascotas: schema.contacts.mascotas,
          mascotasItems: schema.contacts.mascotasItems,
          departamentoId: schema.separations.departamentoId,
          montoSeparacion: schema.separations.montoSeparacion,
          tipoSeparacion: schema.separations.tipoSeparacion,
          garantiaExtendida: schema.separations.garantiaExtendida,
          baucherSeparacion: schema.separations.baucherSeparacion,
          fechaSeparacion: schema.separations.fechaSeparacion,
          diasTiempo: schema.separations.diasTiempo,
          fechaLimiteManual: schema.separations.fechaLimiteManual,
          estado: schema.separations.estado,
          codigoDepartamento: schema.departments.codigo,
          precio: schema.departments.precio,
          garantia: schema.departments.garantia,
        })
        .from(schema.separations)
        .innerJoin(
          schema.contacts,
          eq(schema.contacts.id, schema.separations.contactoId)
        )
        .innerJoin(
          schema.departments,
          eq(schema.departments.id, schema.separations.departamentoId)
        )
        .where(
          and(
            isNull(schema.separations.eliminadoEn),
            isNull(schema.contacts.eliminadoEn),
            inArray(schema.separations.estado, [
              "SEPARADO",
              "GARANTIA_COMPLETADA",
              "CONTRATO_PREVIO",
            ])
          )
        );

      const response = NextResponse.json({
        applicants: applicants.map((row) => ({
          id: `dep-${row.contactoId}-${row.departamentoId}`,
          contactoId: row.contactoId,
          nombres: row.nombre,
          apellidos: row.apellido,
          documentoIdentidad: row.dni,
          ruc: row.ruc,
          tipoPersona: row.tipoPersona,
          email: row.email,
          telefono: row.telefono,
          domicilio: row.domicilio,
          nacionalidad: row.nacionalidad,
          codigoPais: row.codigoPais,
          contactoEmergencia: row.contactoEmergencia,
          mascotas: row.mascotas,
          mascotasItems: row.mascotasItems,
          codigoDepartamento: row.codigoDepartamento,
          departamentoId: row.departamentoId,
          mensualidad:
            row.precio && Number(row.precio) > 0
              ? Number(row.precio).toFixed(2)
              : "",
          garantia:
            row.garantia && Number(row.garantia) > 0
              ? Number(row.garantia).toFixed(2)
              : row.precio && Number(row.precio) > 0
                ? Number(row.precio).toFixed(2)
                : "",
          separacion: {
            departamentoId: row.departamentoId,
            contactoId: row.contactoId,
            montoSeparacion: Number(row.montoSeparacion),
            tipoSeparacion: row.tipoSeparacion,
            garantiaExtendida: row.garantiaExtendida,
            fechaSeparacion: row.fechaSeparacion.toISOString(),
            diasTiempo: row.diasTiempo ?? undefined,
            fechaLimiteManual: row.fechaLimiteManual?.toISOString(),
            ...fechasLimite(row.fechaSeparacion),
            baucherSeparacion: row.baucherSeparacion ?? "",
            estado: row.estado,
          },
        })),
      });
      response.headers.set("Cache-Control", "no-store");
      return withSessionCookies(response);
    }

    if (mode === "departments") {
      if (!canReadDepartments) {
        return requirePermission(auth.user, Permission.DEPARTMENT_READ)!;
      }
      const departments = await db
        .select({
          id: schema.departments.id,
          nombre: schema.departments.nombre,
          codigo: schema.departments.codigo,
          numero: schema.departments.numero,
          precio: schema.departments.precio,
          garantia: schema.departments.garantia,
          mantenimiento: schema.departments.mantenimiento,
          personaPago: schema.departments.personaPago,
        })
        .from(schema.departments)
        .orderBy(schema.departments.nombre, schema.departments.numero);
      const response = NextResponse.json({ departments });
      response.headers.set("Cache-Control", "no-store");
      return withSessionCookies(response);
    }

    if (mode === "templates") {
      if (!canReadTemplates) {
        return requirePermission(auth.user, Permission.TEMPLATE_READ)!;
      }
      const templates = await db
        .select({
          id: schema.templates.id,
          clave: schema.templates.clave,
          nombre: schema.templates.nombre,
        })
        .from(schema.templates)
        .where(eq(schema.templates.activo, true));

      if (templates.length === 0) {
        const response = NextResponse.json({
          templateSelector: { templates: [], versions: {} },
        });
        response.headers.set("Cache-Control", "no-store");
        return withSessionCookies(response);
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

      const response = NextResponse.json({
        templateSelector: { templates, versions },
      });
      response.headers.set("Cache-Control", "no-store");
      return withSessionCookies(response);
    }

    const [contractsResult, departmentsResult, contactsResult, separationsResult, templatesResult] =
      await Promise.allSettled([
        mode === "catalogs"
          ? Promise.resolve(null)
          : db
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
            revision: schema.contracts.revision,
            clienteNombre: schema.clients.nombres,
            clienteApellido: schema.clients.apellidos,
            departamentoNombre: schema.departments.nombre,
            personaPago: schema.departments.personaPago,
          })
          .from(schema.contracts)
          .leftJoin(schema.clients, eq(schema.clients.id, schema.contracts.clienteId))
          .leftJoin(
            schema.departments,
            eq(schema.departments.id, schema.contracts.departamentoId)
          )
          .where(isNull(schema.contracts.eliminadoEn))
          .orderBy(desc(schema.contracts.creadoEn)),
        mode === "contracts" || !canReadDepartments
          ? Promise.resolve(null)
          : db
              .select({
                id: schema.departments.id,
                nombre: schema.departments.nombre,
                codigo: schema.departments.codigo,
                numero: schema.departments.numero,
                precio: schema.departments.precio,
                garantia: schema.departments.garantia,
                mantenimiento: schema.departments.mantenimiento,
                personaPago: schema.departments.personaPago,
              })
              .from(schema.departments)
              .orderBy(schema.departments.nombre, schema.departments.numero),
        mode === "contracts" || !canReadContacts
          ? Promise.resolve(null)
          : db
              .select({
                id: schema.contacts.id,
                nombre: schema.contacts.nombre,
                apellido: schema.contacts.apellido,
                tipoPersona: schema.contacts.tipoPersona,
                dni: schema.contacts.dni,
                ruc: schema.contacts.ruc,
                email: schema.contacts.email,
                telefono: schema.contacts.telefono,
                codigoPais: schema.contacts.codigoPais,
                domicilio: schema.contacts.domicilio,
                nacionalidad: schema.contacts.nacionalidad,
                contactoEmergencia: schema.contacts.contactoEmergencia,
                mascotas: schema.contacts.mascotas,
                mascotasItems: schema.contacts.mascotasItems,
              })
              .from(schema.contacts)
              .where(isNull(schema.contacts.eliminadoEn))
              .orderBy(desc(schema.contacts.createdAt)),
        mode === "contracts" || !canReadDepartments
          ? Promise.resolve(null)
          : db
              .select()
              .from(schema.separations)
              .where(isNull(schema.separations.eliminadoEn)),
        mode === "contracts" || !canReadTemplates
          ? Promise.resolve(null)
          : (async () => {
              const templates = await db
                .select({
                  id: schema.templates.id,
                  clave: schema.templates.clave,
                  nombre: schema.templates.nombre,
                })
                .from(schema.templates)
                .where(eq(schema.templates.activo, true));

              if (templates.length === 0) {
                return { templates: [], versions: {} };
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
              return { templates, versions };
            })(),
      ]);

    if (contractsResult.status === "rejected") {
      throw contractsResult.reason;
    }

    const contracts = (contractsResult.value ?? []).map((row) => ({
      ...row,
      createdAt: row.creadoEn.toISOString(),
      updatedAt: row.actualizadoEn.toISOString(),
      clienteNombre: row.clienteNombre ?? "",
      apellidoCliente: row.clienteApellido ?? "",
      departamentoNombre: row.departamentoNombre ?? "",
    }));

    if (mode === "contracts") {
      const response = NextResponse.json({
        contracts,
        departments: null,
        contacts: null,
        separations: null,
        templateSelector: null,
        failures: [],
      });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const failures: string[] = [];
    const optionalValue = <T,>(
      result: PromiseSettledResult<T | null>,
      name: string,
      permitted: boolean
    ): T | null => {
      if (!permitted) {
        failures.push(name);
        return null;
      }
      if (result.status === "rejected") {
        console.error(`[contracts-bootstrap] ${name} query failed`);
        failures.push(name);
        return null;
      }
      return result.value;
    };

    const departments = optionalValue(
      departmentsResult,
      "departamentos",
      canReadDepartments
    );
    const contacts = optionalValue(contactsResult, "contactos", canReadContacts);
    const rawSeparations = optionalValue(
      separationsResult,
      "separaciones",
      canReadDepartments
    );
    const templateSelector = optionalValue(
      templatesResult,
      "plantillas",
      canReadTemplates
    );

    const separations = rawSeparations?.map((row) => ({
      id: row.id,
      departamentoId: row.departamentoId,
      contactoId: row.contactoId,
      montoSeparacion: Number(row.montoSeparacion),
      tipoSeparacion: row.tipoSeparacion,
      garantiaExtendida: row.garantiaExtendida,
      baucherGarantiaExtendida: row.baucherGarantiaExtendida ?? null,
      fechaGarantiaExtendida: row.fechaGarantiaExtendida?.toISOString() ?? null,
      fechaSeparacion: row.fechaSeparacion.toISOString(),
      diasTiempo: row.diasTiempo ?? undefined,
      fechaLimiteManual: row.fechaLimiteManual?.toISOString() ?? null,
      ...fechasLimite(row.fechaSeparacion),
      baucherSeparacion: row.baucherSeparacion ?? "",
      estado: row.estado,
    }));

    const response = NextResponse.json({
      contracts,
      departments,
      contacts,
      separations,
      templateSelector,
      failures,
    });
    response.headers.set("Cache-Control", "no-store");
    return auth.sessionTokens.refreshed
      ? applySessionCookies(
          response,
          auth.sessionTokens.refreshed,
          isNativeMobileRequest(request)
        )
      : response;
  } catch (error) {
    console.error(
      "[contracts-bootstrap] failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "No se pudieron cargar los datos de Precontratos." },
      { status: 500 }
    );
  }
}
