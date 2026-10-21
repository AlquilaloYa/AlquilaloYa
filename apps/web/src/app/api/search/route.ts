import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type SearchType = "clients" | "contracts" | "departments" | "tasks" | "work_orders";

export interface SearchItem {
  id: string;
  type: SearchType;
  title: string;
  subtitle: string;
  href: string;
  section: string;
}

const LIMIT_PER_TYPE = 8;

export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ items: [] satisfies SearchItem[] });
    }

    const { db, schema } = dbModule as {
      db: typeof import("@contract/db").db;
      schema: typeof import("@contract/db").schema;
    };
    const { and, eq, ilike, isNull, or, desc } = await import("drizzle-orm");

    const requested = (url.searchParams.get("types") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean) as SearchType[];
    const include = (type: SearchType) =>
      requested.length === 0 || requested.includes(type);

    const has = (permission: Permission) =>
      requirePermission(auth.user, permission) === null;

    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const items: SearchItem[] = [];
    const jobs: Promise<void>[] = [];

    if (include("clients") && has(Permission.CLIENT_READ)) {
      jobs.push(
        db
          .select({
            id: schema.clients.id,
            nombres: schema.clients.nombres,
            apellidos: schema.clients.apellidos,
            documento: schema.clients.documentoIdentidad,
          })
          .from(schema.clients)
          .where(
            and(
              eq(schema.clients.activo, true),
              isNull(schema.clients.eliminadoEn),
              or(
                ilike(schema.clients.nombres, pattern),
                ilike(schema.clients.apellidos, pattern),
                ilike(schema.clients.documentoIdentidad, pattern),
              ),
            ),
          )
          .orderBy(schema.clients.nombres)
          .limit(LIMIT_PER_TYPE)
          .then((rows) => {
            for (const row of rows) {
              const nombre = [row.nombres, row.apellidos].filter(Boolean).join(" ");
              items.push({
                id: row.id,
                type: "clients",
                title: nombre,
                subtitle: row.documento ?? "",
                href: `/contratos/clientes/${row.id}`,
                section: "Cliente",
              });
            }
          }),
      );
    }

    if (include("contracts") && has(Permission.CONTRACT_READ)) {
      jobs.push(
        db
          .select({
            id: schema.contracts.id,
            codigo: schema.contracts.codigoContrato,
            estado: schema.contracts.estado,
            clienteId: schema.contracts.clienteId,
          })
          .from(schema.contracts)
          .where(
            and(
              isNull(schema.contracts.eliminadoEn),
              ilike(schema.contracts.codigoContrato, pattern),
            ),
          )
          .orderBy(desc(schema.contracts.creadoEn))
          .limit(LIMIT_PER_TYPE)
          .then((rows) => {
            for (const row of rows) {
              items.push({
                id: row.id,
                type: "contracts",
                title: row.codigo,
                subtitle: row.estado,
                href: `/contratos/${row.id}`,
                section: "Contrato",
              });
            }
          }),
      );
    }

    if (include("departments") && has(Permission.DEPARTMENT_READ)) {
      jobs.push(
        db
          .select({
            id: schema.departments.id,
            nombre: schema.departments.nombre,
            numero: schema.departments.numero,
          })
          .from(schema.departments)
          .where(
            and(
              eq(schema.departments.activo, true),
              or(
                ilike(schema.departments.nombre, pattern),
                ilike(schema.departments.numero, pattern),
              ),
            ),
          )
          .orderBy(schema.departments.numero)
          .limit(LIMIT_PER_TYPE)
          .then((rows) => {
            for (const row of rows) {
              items.push({
                id: row.id,
                type: "departments",
                title: row.nombre,
                subtitle: `N.° ${row.numero}`,
                href: `/departamentos`,
                section: "Departamento",
              });
            }
          }),
      );
    }

    if (include("tasks") && has(Permission.CLIENT_READ)) {
      jobs.push(
        db
          .select({
            id: schema.tasks.id,
            titulo: schema.tasks.titulo,
            estado: schema.tasks.estado,
          })
          .from(schema.tasks)
          .where(ilike(schema.tasks.titulo, pattern))
          .orderBy(desc(schema.tasks.createdAt))
          .limit(LIMIT_PER_TYPE)
          .then((rows) => {
            for (const row of rows) {
              items.push({
                id: row.id,
                type: "tasks",
                title: row.titulo,
                subtitle: row.estado,
                href: `/agenda`,
                section: "Tarea",
              });
            }
          }),
      );
    }

    if (include("work_orders") && has(Permission.WORK_ORDER_READ)) {
      jobs.push(
        db
          .select({
            id: schema.workOrders.id,
            code: schema.workOrders.code,
            title: schema.workOrders.title,
            status: schema.workOrders.status,
          })
          .from(schema.workOrders)
          .where(
            or(
              ilike(schema.workOrders.code, pattern),
              ilike(schema.workOrders.title, pattern),
            ),
          )
          .orderBy(desc(schema.workOrders.createdAt))
          .limit(LIMIT_PER_TYPE)
          .then((rows) => {
            for (const row of rows) {
              items.push({
                id: row.id,
                type: "work_orders",
                title: `${row.code} · ${row.title}`,
                subtitle: row.status,
                href: `/operaciones`,
                section: "Orden de trabajo",
              });
            }
          }),
      );
    }

    await Promise.all(jobs);

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
