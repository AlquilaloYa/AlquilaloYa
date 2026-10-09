import { NextResponse } from "next/server";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t0 = Date.now();
  const conTimeout = <T>(nombre: string, consulta: Promise<T>): Promise<T> =>
    Promise.race([
      consulta,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout query: ${nombre}`)), 15_000)),
    ]).then((valor) => {
      console.log(`[dashboard] ${nombre} ok +${Date.now() - t0}ms`);
      return valor;
    });
  try {
    console.log(`[dashboard] start +${Date.now() - t0}ms`);
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.HR_READ);
    if (denied) return denied;
    console.log(`[dashboard] auth ok +${Date.now() - t0}ms`);
    const { db, schema } = dbModule as { db: typeof import("@contract/db").db; schema: typeof import("@contract/db").schema };
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000);
    const employees = await conTimeout("employees", db.select().from(schema.hrEmployees).where(isNull(schema.hrEmployees.deletedAt)));
    const activeContracts = await conTimeout("contratosActivos", db.select({ id: schema.hrEmployments.id }).from(schema.hrEmployments).where(eq(schema.hrEmployments.estado, "ACTIVO")));
    const expiringContracts = await conTimeout("contratosPorVencer", db.select({ id: schema.hrEmployments.id, employeeId: schema.hrEmployments.employeeId, fechaFin: schema.hrEmployments.fechaFin }).from(schema.hrEmployments)
      .where(and(eq(schema.hrEmployments.estado, "ACTIVO"), gte(schema.hrEmployments.fechaFin, now), lte(schema.hrEmployments.fechaFin, in30))));
    const expiredDocuments = await conTimeout("documentosVencidos", db.select({ id: schema.hrEmployeeDocuments.id }).from(schema.hrEmployeeDocuments).where(and(lte(schema.hrEmployeeDocuments.venceEn, now), eq(schema.hrEmployeeDocuments.estado, "VIGENTE"))));
    const expiringDocuments = await conTimeout("documentosPorVencer", db.select({ id: schema.hrEmployeeDocuments.id, employeeId: schema.hrEmployeeDocuments.employeeId, nombre: schema.hrEmployeeDocuments.nombre, venceEn: schema.hrEmployeeDocuments.venceEn }).from(schema.hrEmployeeDocuments)
      .where(and(gte(schema.hrEmployeeDocuments.venceEn, now), lte(schema.hrEmployeeDocuments.venceEn, in30), eq(schema.hrEmployeeDocuments.estado, "VIGENTE"))));
    const pendingRequests = await conTimeout("solicitudes", db.select({ id: schema.hrRequests.id }).from(schema.hrRequests).where(eq(schema.hrRequests.estado, "PENDIENTE")));
    const pendingOnboarding = await conTimeout("onboarding", db.select({ id: schema.hrEmployees.id }).from(schema.hrEmployees).where(and(isNull(schema.hrEmployees.deletedAt), eq(schema.hrEmployees.onboardingStage, "REGISTRO"))));
    console.log(`[dashboard] queries ok +${Date.now() - t0}ms`);
    const active = employees.filter((employee) => employee.estado === "ACTIVO");
    const groupCounts = (selector: (employee: (typeof employees)[number]) => string) => {
      const values = new Map<string, number>();
      for (const employee of active) {
        const key = selector(employee).trim() || "Sin asignar";
        values.set(key, (values.get(key) ?? 0) + 1);
      }
      return [...values.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    };
    const nameByEmployee = new Map(employees.map((employee) => [employee.id, `${employee.nombres} ${employee.apellidos}`.trim()]));
    return NextResponse.json({
      trabajadoresActivos: active.length,
      incorporaciones30Dias: active.filter((employee) => employee.fechaIngreso && employee.fechaIngreso >= new Date(now.getTime() - 30 * 86_400_000)).length,
      contratosActivos: activeContracts.length,
      contratosPorVencer: expiringContracts.map((item) => ({ ...item, empleado: nameByEmployee.get(item.employeeId) ?? "", fechaFin: item.fechaFin?.toISOString() ?? null })),
      documentosPendientes: expiredDocuments.length,
      documentosPorVencer: expiringDocuments.map((item) => ({ ...item, empleado: nameByEmployee.get(item.employeeId) ?? "", venceEn: item.venceEn?.toISOString() ?? null })),
      solicitudesPendientes: pendingRequests.length,
      onboardingPendiente: pendingOnboarding.length,
      porDepartamento: groupCounts((employee) => employee.area),
      porEquipo: groupCounts((employee) => employee.equipo),
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
