import { NextResponse } from "next/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { ActivityAction } from "@contract/domain/activity";
import { requireUser, requirePermission } from "@/lib/session";
import { registrarActividadHR } from "@/lib/rrhh-actividad";

export const dynamic = "force-dynamic";

const ESTADOS_RH = ["ACTIVO", "INACTIVO", "SUSPENDIDO", "VACACIONES", "PERMISO", "FINALIZADO"] as const;
type EstadoRh = (typeof ESTADOS_RH)[number];

type Doc = { nombre?: string; tipo?: string; url?: string };

type Body = {
  id?: string;
  nombres?: string;
  apellidos?: string;
  dni?: string;
  email?: string;
  telefono?: string;
  cargo?: string;
  area?: string;
  sede?: string;
  equipo?: string;
  responsable?: string;
  organizationId?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  fechaIngreso?: string;
  fechaNacimiento?: string | null;
  nacionalidad?: string;
  codigoEmpleado?: string;
  fechaBaja?: string | null;
  estado?: string;
  onboardingStage?: string;
  direccion?: string;
  notas?: string;
  documentos?: unknown;
  motivo?: string;
};

const CAMPOS_AUDITABLES = [
  "nombres", "apellidos", "dni", "email", "telefono", "cargo", "area",
  "sede", "equipo", "responsable", "organizationId", "siteId", "departmentId",
  "teamId", "positionId", "managerId", "fechaIngreso", "estado", "onboardingStage",
  "direccion", "notas", "fechaNacimiento", "nacionalidad", "codigoEmpleado", "fechaBaja",
] as const;
const ETAPAS_ONBOARDING = ["REGISTRO", "FICHA", "DOCUMENTOS", "VALIDACION", "CONTRATO", "ACCESOS", "ASIGNACION", "FINALIZADO"] as const;

function isOnboardingStage(value: unknown): value is (typeof ETAPAS_ONBOARDING)[number] {
  return ETAPAS_ONBOARDING.includes(value as (typeof ETAPAS_ONBOARDING)[number]);
}

async function validarRelacionesHR(
  db: typeof import("@contract/db").db,
  schema: typeof import("@contract/db").schema,
  body: Body,
  currentEmployeeId?: string
): Promise<string | null> {
  if (body.siteId) {
    const [site] = await db.select({ organizationId: schema.hrSites.organizationId }).from(schema.hrSites).where(eq(schema.hrSites.id, body.siteId)).limit(1);
    if (!site || (body.organizationId && site.organizationId !== body.organizationId)) return "La sede no pertenece a la organización seleccionada";
  }
  if (body.departmentId) {
    const [department] = await db.select({ organizationId: schema.hrDepartments.organizationId }).from(schema.hrDepartments).where(eq(schema.hrDepartments.id, body.departmentId)).limit(1);
    if (!department || (body.organizationId && department.organizationId !== body.organizationId)) return "El área no pertenece a la organización seleccionada";
  }
  if (body.positionId) {
    const [position] = await db.select({ organizationId: schema.hrPositions.organizationId }).from(schema.hrPositions).where(eq(schema.hrPositions.id, body.positionId)).limit(1);
    if (!position || (body.organizationId && position.organizationId !== body.organizationId)) return "El cargo no pertenece a la organización seleccionada";
  }
  if (body.teamId) {
    const [team] = await db.select({ departmentId: schema.hrTeams.departmentId }).from(schema.hrTeams).where(eq(schema.hrTeams.id, body.teamId)).limit(1);
    if (!team || (body.departmentId && team.departmentId !== body.departmentId)) return "El equipo no pertenece al área seleccionada";
  }
  if (body.managerId) {
    if (body.managerId === currentEmployeeId) return "El trabajador no puede ser su propio responsable";
    const [manager] = await db.select({ id: schema.hrEmployees.id }).from(schema.hrEmployees)
      .where(and(eq(schema.hrEmployees.id, body.managerId), eq(schema.hrEmployees.estado, "ACTIVO"), isNull(schema.hrEmployees.deletedAt))).limit(1);
    if (!manager) return "El responsable debe ser un trabajador activo";
  }
  return null;
}

function snapshot(r: Record<string, unknown> | null) {
  if (!r) return null;
  return {
    ...Object.fromEntries(CAMPOS_AUDITABLES.map((campo) => [campo, r[campo] ?? null])),
    documentos: Array.isArray(r.documentos)
      ? r.documentos.map((documento) => {
          const item = documento as Record<string, unknown>;
          return { nombre: item.nombre ?? "", tipo: item.tipo ?? "" };
        })
      : [],
  };
}

function isEstado(value: unknown): value is EstadoRh {
  return ESTADOS_RH.includes(value as EstadoRh);
}

function toDocs(value: unknown): Doc[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      nombre: typeof x.nombre === "string" ? x.nombre : "",
      tipo: typeof x.tipo === "string" ? x.tipo : "",
      url: typeof x.url === "string" ? x.url : "",
    }));
}

function toView(r: {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  telefono: string;
  cargo: string;
  area: string;
  sede: string;
  equipo: string;
  responsable: string;
  organizationId: string | null;
  siteId: string | null;
  departmentId: string | null;
  teamId: string | null;
  positionId: string | null;
  managerId: string | null;
  fechaIngreso: Date | null;
  fechaNacimiento: Date | null;
  nacionalidad: string;
  codigoEmpleado: string;
  fechaBaja: Date | null;
  estado: string;
  onboardingStage: string;
  direccion: string;
  notas: string;
  documentos: unknown;
  creadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    nombres: r.nombres,
    apellidos: r.apellidos,
    dni: r.dni,
    email: r.email,
    telefono: r.telefono,
    cargo: r.cargo,
    area: r.area,
    sede: r.sede,
    equipo: r.equipo,
    responsable: r.responsable,
    organizationId: r.organizationId,
    siteId: r.siteId,
    departmentId: r.departmentId,
    teamId: r.teamId,
    positionId: r.positionId,
    managerId: r.managerId,
    fechaIngreso: r.fechaIngreso?.toISOString?.() ?? null,
    fechaNacimiento: r.fechaNacimiento?.toISOString?.() ?? null,
    nacionalidad: r.nacionalidad,
    codigoEmpleado: r.codigoEmpleado,
    fechaBaja: r.fechaBaja?.toISOString?.() ?? null,
    estado: r.estado,
    onboardingStage: r.onboardingStage,
    direccion: r.direccion,
    notas: r.notas,
    documentos: toDocs(r.documentos),
    creadoPor: r.creadoPor,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

/** GET /api/rrhh — listado de expedientes. */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_READ);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const url = new URL(req.url);
    const historyId = url.searchParams.get("history");
    if (historyId) {
      const history = await db
        .select()
        .from(schema.hrEmployeeHistory)
        .where(eq(schema.hrEmployeeHistory.employeeId, historyId))
        .orderBy(desc(schema.hrEmployeeHistory.createdAt));
      return NextResponse.json(history.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
    }
    const includeArchived = url.searchParams.get("archived") === "true" && auth.user.role === "ADMIN";
    const rows = await db
      .select()
      .from(schema.hrEmployees)
      .where(includeArchived ? undefined : isNull(schema.hrEmployees.deletedAt))
      .orderBy(asc(schema.hrEmployees.apellidos), asc(schema.hrEmployees.nombres));
    return NextResponse.json(rows.map(toView));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/rrhh — crea un expediente. */
export async function POST(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_CREATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body;
    if (!body.nombres?.trim()) {
      return NextResponse.json({ error: "Indica los nombres del colaborador" }, { status: 400 });
    }
    const relationError = await validarRelacionesHR(db, schema, body);
    if (relationError) return NextResponse.json({ error: relationError }, { status: 400 });
    if (body.onboardingStage && !isOnboardingStage(body.onboardingStage)) {
      return NextResponse.json({ error: "Etapa de onboarding inválida" }, { status: 400 });
    }
    const nombres = body.nombres.trim();
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.hrEmployees).values({
        nombres,
        apellidos: (body.apellidos ?? "").trim(),
        dni: (body.dni ?? "").trim(),
        email: (body.email ?? "").trim(),
        telefono: (body.telefono ?? "").trim(),
        cargo: (body.cargo ?? "").trim(),
        area: (body.area ?? "").trim(),
        sede: (body.sede ?? "").trim(),
        equipo: (body.equipo ?? "").trim(),
        responsable: (body.responsable ?? "").trim(),
        organizationId: body.organizationId || null,
        siteId: body.siteId || null,
        departmentId: body.departmentId || null,
        teamId: body.teamId || null,
        positionId: body.positionId || null,
        managerId: body.managerId || null,
        fechaIngreso: body.fechaIngreso ? new Date(body.fechaIngreso) : null,
        fechaNacimiento: body.fechaNacimiento ? new Date(body.fechaNacimiento) : null,
        nacionalidad: (body.nacionalidad ?? "").trim(),
        codigoEmpleado: (body.codigoEmpleado ?? "").trim(),
        fechaBaja: body.fechaBaja ? new Date(body.fechaBaja) : null,
        estado: isEstado(body.estado) ? body.estado : "ACTIVO",
        onboardingStage: body.onboardingStage ?? "REGISTRO",
        direccion: (body.direccion ?? "").trim(),
        notas: (body.notas ?? "").trim(),
        documentos: toDocs(body.documentos),
        creadoPor: auth.user.name || auth.user.email,
      }).returning();
      if (!created) return null;
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: created.id,
        actor: auth.user.name || auth.user.email,
        action: "CREATED",
        motivo: (body.motivo ?? "").trim() || "Alta de expediente",
        after: snapshot(created as unknown as Record<string, unknown>),
      });
      return created;
    });
    if (!row) {
      return NextResponse.json({ error: "No se pudo crear el expediente" }, { status: 500 });
    }
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: auth.user.name || auth.user.email,
      action: ActivityAction.HR_EMPLOYEE_CREATED,
      entityId: row.id,
      metadata: { nombres: row.nombres, apellidos: row.apellidos, codigoEmpleado: row.codigoEmpleado },
    });
    return NextResponse.json(toView(row), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PUT /api/rrhh — actualiza un expediente por id. */
export async function PUT(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const body = (await req.json()) as Body;
    if (!body.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [existing] = await db
      .select()
      .from(schema.hrEmployees)
      .where(and(eq(schema.hrEmployees.id, body.id), isNull(schema.hrEmployees.deletedAt)));
    if (!existing) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    const relationError = await validarRelacionesHR(db, schema, body, body.id);
    if (relationError) return NextResponse.json({ error: relationError }, { status: 400 });
    if (body.onboardingStage !== undefined && !isOnboardingStage(body.onboardingStage)) {
      return NextResponse.json({ error: "Etapa de onboarding inválida" }, { status: 400 });
    }
    const patch: {
      nombres?: string;
      apellidos?: string;
      dni?: string;
      email?: string;
      telefono?: string;
      cargo?: string;
      area?: string;
      sede?: string;
      equipo?: string;
      responsable?: string;
      organizationId?: string | null;
      siteId?: string | null;
      departmentId?: string | null;
      teamId?: string | null;
      positionId?: string | null;
      managerId?: string | null;
      fechaIngreso?: Date | null;
      fechaNacimiento?: Date | null;
      nacionalidad?: string;
      codigoEmpleado?: string;
      fechaBaja?: Date | null;
      estado?: string;
      onboardingStage?: string;
      direccion?: string;
      notas?: string;
      documentos?: Doc[];
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (body.nombres !== undefined) {
      if (!body.nombres.trim()) {
        return NextResponse.json({ error: "Indica los nombres del colaborador" }, { status: 400 });
      }
      patch.nombres = body.nombres.trim();
    }
    if (body.apellidos !== undefined) patch.apellidos = body.apellidos.trim();
    if (body.dni !== undefined) patch.dni = body.dni.trim();
    if (body.email !== undefined) patch.email = body.email.trim();
    if (body.telefono !== undefined) patch.telefono = body.telefono.trim();
    if (body.cargo !== undefined) patch.cargo = body.cargo.trim();
    if (body.area !== undefined) patch.area = body.area.trim();
    if (body.sede !== undefined) patch.sede = body.sede.trim();
    if (body.equipo !== undefined) patch.equipo = body.equipo.trim();
    if (body.responsable !== undefined) patch.responsable = body.responsable.trim();
    if (body.organizationId !== undefined) patch.organizationId = body.organizationId || null;
    if (body.siteId !== undefined) patch.siteId = body.siteId || null;
    if (body.departmentId !== undefined) patch.departmentId = body.departmentId || null;
    if (body.teamId !== undefined) patch.teamId = body.teamId || null;
    if (body.positionId !== undefined) patch.positionId = body.positionId || null;
    if (body.managerId !== undefined) patch.managerId = body.managerId || null;
    if (body.fechaIngreso !== undefined) {
      patch.fechaIngreso = body.fechaIngreso ? new Date(body.fechaIngreso) : null;
    }
    if (body.fechaNacimiento !== undefined) {
      patch.fechaNacimiento = body.fechaNacimiento ? new Date(body.fechaNacimiento) : null;
    }
    if (body.nacionalidad !== undefined) patch.nacionalidad = body.nacionalidad.trim();
    if (body.codigoEmpleado !== undefined) patch.codigoEmpleado = body.codigoEmpleado.trim();
    if (body.fechaBaja !== undefined) {
      patch.fechaBaja = body.fechaBaja ? new Date(body.fechaBaja) : null;
    }
    if (body.estado !== undefined) {
      if (!isEstado(body.estado)) return NextResponse.json({ error: "Estado laboral inválido" }, { status: 400 });
      patch.estado = body.estado;
    }
    if (body.onboardingStage !== undefined) patch.onboardingStage = body.onboardingStage;
    if (body.direccion !== undefined) patch.direccion = body.direccion.trim();
    if (body.notas !== undefined) patch.notas = body.notas.trim();
    if (body.documentos !== undefined) patch.documentos = toDocs(body.documentos);
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.hrEmployees).set(patch).where(eq(schema.hrEmployees.id, body.id!)).returning();
      if (!updated) return null;
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: updated.id,
        actor: auth.user.name || auth.user.email,
        action: "UPDATED",
        motivo: (body.motivo ?? "").trim(),
        before: snapshot(existing as unknown as Record<string, unknown>),
        after: snapshot(updated as unknown as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: auth.user.name || auth.user.email,
      action: ActivityAction.HR_EMPLOYEE_UPDATED,
      entityId: row.id,
      metadata: { motivo: (body.motivo ?? "").trim() || null },
    });
    return NextResponse.json(toView(row));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/rrhh?id= — archiva el expediente y conserva su historial. */
export async function DELETE(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user.role, Permission.HR_UPDATE);
    if (denied) return denied;

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const [existing] = await db.select().from(schema.hrEmployees)
      .where(and(eq(schema.hrEmployees.id, id), isNull(schema.hrEmployees.deletedAt)));
    if (!existing) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    const row = await db.transaction(async (tx) => {
      const [archived] = await tx.update(schema.hrEmployees)
        .set({ deletedAt: new Date(), estado: "FINALIZADO", updatedAt: new Date() })
        .where(eq(schema.hrEmployees.id, id))
        .returning();
      if (!archived) return null;
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: archived.id,
        actor: auth.user.name || auth.user.email,
        action: "ARCHIVED",
        motivo: "Baja y archivado del expediente",
        before: snapshot(existing as unknown as Record<string, unknown>),
        after: snapshot(archived as unknown as Record<string, unknown>),
      });
      return archived;
    });
    if (!row) {
      return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    }
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: auth.user.name || auth.user.email,
      action: ActivityAction.HR_EMPLOYEE_ARCHIVED,
      entityId: id,
      metadata: { nombres: row.nombres, apellidos: row.apellidos },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}