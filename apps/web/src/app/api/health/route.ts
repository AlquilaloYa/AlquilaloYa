import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@contract/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      database: "ok",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "error",
        error: error instanceof Error ? error.message : "database unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
