import { NextResponse } from "next/server";
import { evaluarReglas } from "@/lib/automatizaciones";
import { evaluateContractExpiryNotifications } from "@/lib/contract-expiry-notifications";
import { safeEqual } from "@/lib/secure-compare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/automatizaciones — lo invoca Vercel Cron cada hora.
 * Protegido con Authorization: Bearer <CRON_SECRET> (Vercel lo envía solo
 * si defines CRON_SECRET en las variables del proyecto).
 */
async function run(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Cron no configurado: define CRON_SECRET" }, { status: 503 });
    }
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${secret}`)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const resultados = await evaluarReglas("CRON");
    const vencimientos = await evaluateContractExpiryNotifications();
    return NextResponse.json({ ok: true, resultados, vencimientos });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
