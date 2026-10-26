import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { requirePermission, requireUser } from "@/lib/session";
import { createSignedObjectUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
const BUCKET = "client-work-order-evidence";

export async function GET(request: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, request);
    if ("error" in auth) return auth.error;
    const denied = requirePermission(auth.user, Permission.WORK_ORDER_READ);
    if (denied) return denied;

    const rows = await dbModule.db
      .select({
        id: dbModule.schema.clientWorkOrderRequests.id,
        clientId: dbModule.schema.clientWorkOrderRequests.clientId,
        clientName: sql<string>`trim(coalesce(${dbModule.schema.clients.nombres}, '') || ' ' || coalesce(${dbModule.schema.clients.apellidos}, ''))`,
        departmentId: dbModule.schema.clientWorkOrderRequests.departmentId,
        departmentCode: dbModule.schema.departments.codigo,
        departmentName: dbModule.schema.departments.nombre,
        issueType: dbModule.schema.clientWorkOrderRequests.issueType,
        description: dbModule.schema.clientWorkOrderRequests.description,
        customerPresentAtVisit: dbModule.schema.clientWorkOrderRequests.customerPresentAtVisit,
        availabilityOptions: dbModule.schema.clientWorkOrderRequests.availabilityOptions,
        status: dbModule.schema.clientWorkOrderRequests.status,
        workOrderId: dbModule.schema.clientWorkOrderRequests.workOrderId,
        workOrderCode: dbModule.schema.workOrders.code,
        createdAt: dbModule.schema.clientWorkOrderRequests.createdAt,
        reviewedAt: dbModule.schema.clientWorkOrderRequests.reviewedAt,
      })
      .from(dbModule.schema.clientWorkOrderRequests)
      .innerJoin(
        dbModule.schema.clients,
        eq(dbModule.schema.clients.id, dbModule.schema.clientWorkOrderRequests.clientId),
      )
      .leftJoin(
        dbModule.schema.departments,
        eq(dbModule.schema.departments.id, dbModule.schema.clientWorkOrderRequests.departmentId),
      )
      .leftJoin(
        dbModule.schema.workOrders,
        eq(dbModule.schema.workOrders.id, dbModule.schema.clientWorkOrderRequests.workOrderId),
      )
      .orderBy(desc(dbModule.schema.clientWorkOrderRequests.createdAt))
      .limit(200);

    const items = await Promise.all(
      rows.map(async (row) => {
        const attachments = await dbModule.db
          .select({
            id: dbModule.schema.clientPortalUploads.id,
            fileName: dbModule.schema.clientPortalUploads.fileName,
            mimeType: dbModule.schema.clientPortalUploads.mimeType,
            sizeBytes: dbModule.schema.clientPortalUploads.sizeBytes,
            storageKey: dbModule.schema.clientPortalUploads.storageKey,
          })
          .from(dbModule.schema.clientPortalUploads)
          .where(eq(dbModule.schema.clientPortalUploads.requestId, row.id));
        return {
          ...row,
          attachments: await Promise.all(
            attachments.map(async ({ storageKey, ...attachment }) => ({
              ...attachment,
              url: await createSignedObjectUrl(storageKey, BUCKET),
            })),
          ),
        };
      }),
    );
    const response = NextResponse.json({ items });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las solicitudes de clientes.",
      },
      { status: 500 },
    );
  }
}
