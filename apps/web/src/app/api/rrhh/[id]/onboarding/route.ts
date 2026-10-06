import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { ActivityAction } from "@contract/domain/activity";
import { requireUser, requirePermission } from "@/lib/session";
import { registrarActividadHR } from "@/lib/rrhh-actividad";

export const dynamic = "force-dynamic";

/**
 * §13 — Pasos del onboarding en el mismo orden que las etapas del expediente.
 * RRHH no tiene motor de tareas propio: cada paso crea además una fila en la
 * tabla transversal `tasks` (§14), de modo que aparece en el tablero general.
 */
const PASOS = [
  { clave: "REGISTRO", titulo: "Crear expediente", descripcion: "Alta de la persona y datos de contacto." },
  { clave: "FICHA", titulo: "Completar ficha", descripcion: "Datos laborales, cargo, área y responsable directo." },
  { clave: "DOCUMENTOS", titulo: "Validar documentación", descripcion: "Documento de identidad y expediente documental." },
  { clave: "VALIDACION", titulo: "Revisión y validación", descripcion: "Verificación de datos e integridad del expediente." },
  { clave: "CONTRATO", titulo: "Registrar relación laboral", descripcion: "Alta del periodo en la relación laboral del trabajador." },
  { clave: "ACCESOS", titulo: "Dar de alta accesos", descripcion: "Usuario y permisos en el sistema." },
  { clave: "ASIGNACION", titulo: "Asignación organizacional", descripcion: "Sede, área, equipo y responsable directo." },
  { clave: "FINALIZADO", titulo: "Finalizar onboarding", descripcion: "Cierre formal de la incorporación." },
] as const;

type PasoClave = (typeof PASOS)[number]["clave"];

const CLAVES: PasoClave[] = PASOS.map((paso) => paso.clave);

function esClave(value: unknown): value is PasoClave {
  return CLAVES.includes(value as PasoClave);
}

type ProcessRow = {
  id: string;
  employeeId: string;
  etapa: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  creadoPor: string;
};

type StepRow = {
  id: string;
  processId: string;
  clave: string;
  titulo: string;
  descripcion: string;
  orden: number;
  estado: string;
  taskId: string | null;
  responsable: string;
  fechaLimite: Date | null;
  completedAt: Date | null;
};

function serializar(process: ProcessRow | undefined, pasos: StepRow[]) {
  if (!process) return null;
  return {
    id: process.id,
    employeeId: process.employeeId,
    etapa: process.etapa,
    estado: process.estado,
    fechaInicio: process.fechaInicio.toISOString(),
    fechaFin: process.fechaFin?.toISOString() ?? null,
    creadoPor: process.creadoPor,
    pasos: pasos.map((paso) => ({
      id: paso.id,
      clave: paso.clave,
      titulo: paso.titulo,
      descripcion: paso.descripcion,
      orden: paso.orden,
      estado: paso.estado,
      taskId: paso.taskId,
      responsable: paso.responsable,
      fechaLimite: paso.fechaLimite?.toISOString() ?? null,
      completedAt: paso.completedAt?.toISOString() ?? null,
    })),
  };
}

async function cargar(
  db: typeof import("@contract/db").db,
  schema: typeof import("@contract/db").schema,
  employeeId: string
) {
  const [process] = await db
    .select()
    .from(schema.hrOnboardingProcesses)
    .where(eq(schema.hrOnboardingProcesses.employeeId, employeeId))
    .orderBy(asc(schema.hrOnboardingProcesses.createdAt))
    .limit(1);
  if (!process) return { process: undefined as ProcessRow | undefined, pasos: [] as StepRow[] };
  const pasos = await db
    .select()
    .from(schema.hrOnboardingTasks)
    .where(eq(schema.hrOnboardingTasks.processId, process.id))
    .orderBy(asc(schema.hrOnboardingTasks.orden));
  return { process, pasos };
}

async function empleado(db: typeof import("@contract/db").db, schema: typeof import("@contract/db").schema, id: string) {
  const [row] = await db
    .select({
      id: schema.hrEmployees.id,
      nombres: schema.hrEmployees.nombres,
      apellidos: schema.hrEmployees.apellidos,
      fechaIngreso: schema.hrEmployees.fechaIngreso,
      onboardingStage: schema.hrEmployees.onboardingStage,
      deletedAt: schema.hrEmployees.deletedAt,
    })
    .from(schema.hrEmployees)
    .where(eq(schema.hrEmployees.id, id))
    .limit(1);
  return row;
}

/** GET /api/rrhh/:id/onboarding — proceso y pasos del trabajador. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
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
    const person = await empleado(db, schema, params.id);
    if (!person || person.deletedAt) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    const { process, pasos } = await cargar(db, schema, params.id);
    return NextResponse.json(serializar(process, pasos));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/rrhh/:id/onboarding — inicia el proceso y crea sus tareas. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
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
    const person = await empleado(db, schema, params.id);
    if (!person || person.deletedAt) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    const existente = await cargar(db, schema, params.id);
    if (existente.process && existente.process.estado === "EN_CURSO") {
      return NextResponse.json({ error: "El trabajador ya tiene un onboarding en curso" }, { status: 409 });
    }

    const actor = auth.user.name || auth.user.email;
    const ahora = new Date();
    const resultado = await db.transaction(async (tx) => {
      const [process] = await tx
        .insert(schema.hrOnboardingProcesses)
        .values({
          employeeId: params.id,
          etapa: person.onboardingStage || "REGISTRO",
          estado: "EN_CURSO",
          fechaInicio: ahora,
          creadoPor: actor,
        })
        .returning();
      if (!process) return { error: "No se pudo iniciar el onboarding" } as const;

      for (const [indice, paso] of PASOS.entries()) {
        // El vencimiento crece un día por paso para que el tablero respete el orden.
        const vence = new Date(ahora.getTime() + (indice + 1) * 86_400_000);
        const [tarea] = await tx
          .insert(schema.tasks)
          .values({
            titulo: `Onboarding · ${paso.titulo}`,
            descripcion: `${paso.descripcion}\n\nTrabajador: ${`${person.nombres} ${person.apellidos}`.trim()}`,
            asignadoA: actor,
            empleadoId: null,
            fechaLimite: vence,
            estado: "PENDIENTE",
            creadoPor: actor,
            origenTipo: "ONBOARDING",
            origenEvento: "ONBOARDING",
          })
          .returning({ id: schema.tasks.id });
        await tx.insert(schema.hrOnboardingTasks).values({
          processId: process.id,
          clave: paso.clave,
          titulo: paso.titulo,
          descripcion: paso.descripcion,
          orden: indice,
          estado: "PENDIENTE",
          taskId: tarea?.id ?? null,
          responsable: actor,
          fechaLimite: vence,
        });
      }

      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: params.id,
        actor,
        action: "ONBOARDING_STARTED",
        motivo: "Alta de proceso de onboarding",
        after: { processId: process.id, etapa: process.etapa, estado: process.estado, pasos: PASOS.length },
      });

      const recargado = await cargar(db, schema, params.id);
      return { process, payload: serializar(recargado.process, recargado.pasos) } as const;
    });
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: 500 });
    await registrarActividadHR(db, schema, {
      actorId: auth.user.id,
      actorName: actor,
      action: ActivityAction.HR_ONBOARDING_STARTED,
      entityId: params.id,
      metadata: { processId: resultado.process.id, etapa: resultado.process.etapa, pasos: PASOS.length },
    });
    return NextResponse.json(resultado.payload, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * PATCH /api/rrhh/:id/onboarding
 * Body { clave, completada } — marca un paso y adelanta la etapa del expediente.
 * Cuando terminan todos, el proceso queda COMPLETADO y la etapa en FINALIZADO.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
    const body = (await req.json()) as { clave?: string; completada?: boolean };
    if (!esClave(body.clave)) return NextResponse.json({ error: "Paso de onboarding inválido" }, { status: 400 });
    const completada = body.completada !== false;

    const person = await empleado(db, schema, params.id);
    if (!person || person.deletedAt) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });
    const { process, pasos } = await cargar(db, schema, params.id);
    if (!process || process.estado !== "EN_CURSO") {
      return NextResponse.json({ error: "No hay un onboarding en curso para este trabajador" }, { status: 409 });
    }
    const paso = pasos.find((item) => item.clave === body.clave);
    if (!paso) return NextResponse.json({ error: "El paso no pertenece a este proceso" }, { status: 404 });

    const actor = auth.user.name || auth.user.email;
    const ahora = new Date();
    const estado = completada ? "RESUELTA" : "PENDIENTE";

    await db.transaction(async (tx) => {
      await tx
        .update(schema.hrOnboardingTasks)
        .set({ estado, completedAt: completada ? ahora : null, updatedAt: ahora })
        .where(eq(schema.hrOnboardingTasks.id, paso.id));
      if (paso.taskId) {
        await tx
          .update(schema.tasks)
          .set({ estado, completedAt: completada ? ahora : null, updatedAt: ahora })
          .where(eq(schema.tasks.id, paso.taskId));
      }

      const hechas = pasos.filter((item) => item.clave === paso.clave ? completada : item.estado === "RESUELTA").length;
      const total = pasos.length;
      const terminado = hechas === total;
      const etapa = terminado ? "FINALIZADO" : paso.clave;

      await tx
        .update(schema.hrOnboardingProcesses)
        .set({ etapa, estado: terminado ? "COMPLETADO" : "EN_CURSO", fechaFin: terminado ? ahora : null, updatedAt: ahora })
        .where(eq(schema.hrOnboardingProcesses.id, process.id));
      await tx
        .update(schema.hrEmployees)
        .set({ onboardingStage: etapa, updatedAt: ahora })
        .where(eq(schema.hrEmployees.id, params.id));
      await tx.insert(schema.hrEmployeeHistory).values({
        employeeId: params.id,
        actor,
        action: completada ? "ONBOARDING_STEP_DONE" : "ONBOARDING_STEP_REOPENED",
        motivo: `${paso.titulo} → ${estado}`,
        before: { etapa: process.etapa, paso: paso.clave, estado: paso.estado },
        after: { etapa, paso: paso.clave, estado, proceso: terminado ? "COMPLETADO" : "EN_CURSO" },
      });
    });

    const recargado = await cargar(db, schema, params.id);
    if (completada) {
      await registrarActividadHR(db, schema, {
        actorId: auth.user.id,
        actorName: actor,
        action: ActivityAction.HR_ONBOARDING_STEP_DONE,
        entityId: params.id,
        metadata: { paso: paso.clave, titulo: paso.titulo },
      });
    }
    return NextResponse.json(serializar(recargado.process, recargado.pasos));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
