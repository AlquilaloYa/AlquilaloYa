import { NextResponse } from "next/server";
import { Permission } from "@contract/domain/rbac";
import { WorkflowService } from "@contract/domain/workflow";
import { requireUser, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/workflow — tablero operativo de contratos (Fase 5). */
export async function GET(req: Request) {
  try {
    const dbModule = await import("@contract/db");
    const auth = await requireUser(dbModule, req);
    if ("error" in auth) return auth.error;

    const denied = requirePermission(auth.user.role, Permission.CONTRACT_READ);
    if (denied) return denied;

    const service = new WorkflowService(new dbModule.DrizzleWorkflowRepository());
    const board = await service.listBoard();
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
