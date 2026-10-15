import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { isNativeMobileRequest } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

type PushTokenBody = {
  token?: unknown;
};

export async function POST(req: Request) {
  if (!isNativeMobileRequest(req)) {
    return NextResponse.json({ error: "Cliente móvil requerido" }, { status: 403 });
  }

  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;

  let body: PushTokenBody;
  try {
    body = (await req.json()) as PushTokenBody;
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON válido" }, { status: 400 });
  }

  if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 4096) {
    return NextResponse.json({ error: "El token de notificaciones no es válido" }, { status: 400 });
  }

  const { db, schema } = dbModule;
  await db
    .insert(schema.fieldopsPushTokens)
    .values({ userId: auth.user.id, token: body.token, platform: "android" })
    .onConflictDoUpdate({
      target: schema.fieldopsPushTokens.token,
      set: {
        userId: auth.user.id,
        platform: "android",
        updatedAt: new Date(),
      },
    });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(req: Request) {
  if (!isNativeMobileRequest(req)) {
    return NextResponse.json({ error: "Cliente móvil requerido" }, { status: 403 });
  }

  const dbModule = await import("@contract/db");
  const auth = await requireUser(dbModule, req);
  if ("error" in auth) return auth.error;

  let body: PushTokenBody;
  try {
    body = (await req.json()) as PushTokenBody;
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON válido" }, { status: 400 });
  }

  if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 4096) {
    return NextResponse.json({ error: "El token de notificaciones no es válido" }, { status: 400 });
  }

  const { db, schema } = dbModule;
  await db
    .delete(schema.fieldopsPushTokens)
    .where(
      and(
        eq(schema.fieldopsPushTokens.userId, auth.user.id),
        eq(schema.fieldopsPushTokens.token, body.token),
      ),
    );

  return new NextResponse(null, { status: 204 });
}
