import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/secure-compare";
import { sendClientPaymentReminders } from "@/lib/client-payment-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron no configurado: define CRON_SECRET." },
      { status: 503 },
    );
  }
  if (
    !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
  ) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const dbModule = await import("@contract/db");
    const reminders = await sendClientPaymentReminders(dbModule);
    return NextResponse.json({ ok: true, reminders });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron enviar los avisos de pago.",
      },
      { status: 500 },
    );
  }
}
