import { NextResponse } from "next/server";
import {
  applyClientPortalCookies,
  clientPortalAuthEmail,
  findPortalLoginTarget,
  loginClientPortalPassword,
  sameOriginRequest,
} from "@/lib/client-portal-auth";
import { checkClientPortalLimit } from "@/lib/client-portal-rate-limit";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  try {
    if (!(await checkClientPortalLimit(`login:${clientIp(request.headers)}`, 8, 15 * 60_000))) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
        { status: 429 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No se pudo validar el acceso. Inténtalo más tarde." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const { departmentCode, password } = body as Record<string, unknown>;
  if (
    typeof departmentCode !== "string" ||
    departmentCode.trim().length < 2 ||
    departmentCode.length > 50 ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 128
  ) {
    return NextResponse.json(
      { error: "Ingresa el código de departamento y la contraseña." },
      { status: 400 },
    );
  }

  try {
    const dbModule = await import("@contract/db");
    const target = await findPortalLoginTarget(dbModule, departmentCode);
    if (!target) {
      return NextResponse.json(
        { error: "Código de departamento o contraseña no válidos, o contrato no vigente." },
        { status: 401 },
      );
    }
    if (!(await checkClientPortalLimit(`login-target:${target.authUserId}`, 8, 15 * 60_000))) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
        { status: 429 },
      );
    }

    const tokens = await loginClientPortalPassword(
      clientPortalAuthEmail(departmentCode),
      password,
    );
    if (
      !tokens ||
      tokens.user.id !== target.authUserId ||
      tokens.user.email?.toLowerCase() !== target.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Código de departamento o contraseña no válidos, o contrato no vigente." },
        { status: 401 },
      );
    }
    return applyClientPortalCookies(NextResponse.json({ ok: true }), tokens);
  } catch {
    return NextResponse.json(
      { error: "No fue posible iniciar sesión. Inténtalo más tarde." },
      { status: 503 },
    );
  }
}
