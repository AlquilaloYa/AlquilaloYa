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
    // SEC-074: no exponer detalles internos (mensajes de driver, host, etc.).
    // El detalle queda en logs del servidor; la respuesta es genérica.
    console.error(
      "[health] fallo de base de datos:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        status: "degraded",
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
